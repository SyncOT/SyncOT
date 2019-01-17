I'll update these docs over time. For now it's just a collection of ideas which guide the implementation.

# Data Model

The data model is based on the Operational Transformation concept with a central server defining the total order of events. The system supports arbitrary OT types, as long as they correctly implement the `Type` interface. CRDT types are also supported as they are just a special case of OT types which don't require a `transform` function.

The main components of the system are:

-   `Operation`: Describes a content change.
-   `Snapshot`: Represents the `Document`'s content at a particular version.
-   `Document`: Brings the related `Operation`s and `Snapshot`s together to define a read-write, real-time-synchronised view of the underlying data. The `Document`'s identity is defined by its immutable `id` and `type` properties.
-   `Type`: Defines the structure of `Operation` and `Snapshot` data and how they interact with each other.

# Storage

`Operation`s are the source of truth and are stored in a server-side database, eg MongoDB. They may also be saved on the client side to support working offline but they should eventually be synced with the server.

All `Snapshot`s can be recreated from operations, so they don't have to be stored, however, for performance reasons it is adviseable to cache them, eg in Redis. They may also be cached on the client side to support working offline.

## Operation Storage in MongoDB

-   Unique index on: `type`, `id`, `version`.
-   Shard key on: `type`, `id`.

The version number is always incremented by one, so it's always clear what the version number of a new operation should be. The unique index is used to detect conflicting writes. If one happens, the new operation is transformed agaist the one which has been just saved, and the save is retried with an increased version number. This way our data is fully consistent and clean at all times.

`Snapshot`s may be optionally cached after the `Operation` has been committed to the main database without any risk to data consistency.

# Metadata

Metadata can be used to store any additional information which does not affect the main content, for example the operation timestamp or presence information (eg user's cursor location in a text document). Some metadata items might be relevant long term, eg timestamps, while others could become irrelevant in seconds, eg cursor location.

## Metadata Storage

To avoid making potentially incorrect assumptions and to simplify the implementation, `SyncOT` always stores all metadata. If some or all of that metadata becomes obsolete, it can be purged to save storage space. `SyncOT` provides an API to facilitate purging metadata in a safe way.
