I'll update these docs over time. For now it's just a collection of ideas which guide the implementation.

# Data Model

The data model is based on the Operational Transformation concept with a central server defining the total order of events. The system supports arbitrary OT types, as long as they correctly implement the `Type` interface. CRDT types are also supported as they are just a special case of OT types which don't require a `transform` function.

The main components of the system are:

-   `Operation`: Describes a content change.
-   `Snapshot`: Represents the `Document`'s content at a particular version.
-   `Document`: Brings the related `Operation`s and `Snapshot`s together to define a read-write, real-time-synchronised view of the underlying data. The `Document`'s identity is defined by its immutable `id` and `type` properties.
-   `Type`: Defines the structure of `Operation` and `Snapshot` data and metadata, and how they interact with each other.

# Storage

`Operation`s are the source of truth and are stored in a server-side database, eg MongoDB. They may also be saved on the client side to support working offline but they should eventually be synced with the server.

All `Snapshot`s can be recreated from operations, so they don't have to be stored, however, for performance reasons it is adviseable to cache them, eg in Redis. They may also be cached on the client side to support working offline.

## Operation Storage in MongoDB

-   Unique index on: `type`, `id`, `version`.
-   Shard key on: `type`, `id`.

The version number is always incremented by one, so it's always clear what the version number of a new operation should be. The unique index is used to detect conflicting writes. If one happens, the new operation is transformed agaist the one which has been just saved, and the save is retried with an increased version number. This way our data is fully consistent and clean at all times.

`Snapshot`s may be optionally cached after the `Operation` has been committed to the main database without any risk to data consistency.

# Metadata

Metadata can be used to store any additional information which does not affect the main content, eg a timestamp, user id, or cursor position in a text document.
Some of that metadata might be relevant only for a short time, eg the cursor position, so it might be tempting to avoid storing it in order to save some space. I decided not to make any assumptions and simply always store all metadata because it:

-   **greatly** simplifies the implementation the whole library,
-   always provides full, consistent and accurate information to the `Type`s,
-   is unlikely to incur much overhead due to its usually small size, compression (eg [MongoDB compression](https://www.mongodb.com/blog/post/new-compression-options-mongodb-30)) and removal of older operations from the client-side storage,
-   the storage requirements can be reduced further by composing multiple older operations into fewer bigger operations, if necessary. Unfortunately, this would involve changing the history, so it should be attempted only as the last resort and with great care. SyncOT will not support it unless clearly necessary.

# Immutable Data

All `Operation`s and `Snapshot`s are immutable across the whole system, which makes it significantly simpler and less error prone compared to one in which mutations are allowed. One important consequence of this decision is that any `Type` updates must be backwards compatible down to the very first version. Any breaking changes in a `Type` implementation would require definition of a new `Type` and manual data migration, which is outside the scope of this project.

# Events

All events are emitted asynchronously by default by SyncOt components to avoid corrupting the state of the emitters and for consistency. An important consequence of this decission is that all state-change events must be seen as happening in the past, for example, a `connect` event means that a component has been connected a moment ago but it is possible that it is no longer connected when the event listener is called. Interestingly, this situation would not be prevented even if events were dispatched synchronously - an "earlier" event listener could synchronously change the state before the "following" listeners are called.
