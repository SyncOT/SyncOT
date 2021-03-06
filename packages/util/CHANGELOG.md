# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0](https://github.com/SyncOT/SyncOT/compare/@syncot/util@1.0.3...@syncot/util@2.0.0) (2020-11-16)


### Bug Fixes

* replace SyncOt with SyncOT everywhere ([1643d98](https://github.com/SyncOT/SyncOT/commit/1643d98d22a811444a8992cbfb26598a583a5afd))


### Features

* add createId ([dd2242f](https://github.com/SyncOT/SyncOT/commit/dd2242f7bb2cf0a97b295f5c2f5553d29b0a37ab))
* add stream utils ([e63f9dc](https://github.com/SyncOT/SyncOT/commit/e63f9dc7246f2fc5cb84ebbabdf04c7caacdc9e5))
* add task runner ([d4c0fe0](https://github.com/SyncOT/SyncOT/commit/d4c0fe04d106ee40c8d506cf9a6d9728b33a2166))
* move code here from @syncot/events ([07d2e35](https://github.com/SyncOT/SyncOT/commit/07d2e35971f083bafdf5a77b70ffd90e755c5579))
* move errors here from @syncot/error ([ed34daf](https://github.com/SyncOT/SyncOT/commit/ed34daf04c610df0eb552de55c28c93f1aaf1518))


### BREAKING CHANGES

* "SyncOt" replaced with "SyncOT" in the whole codebase





## [1.0.3](https://github.com/SyncOT/SyncOT/compare/@syncot/util@1.0.2...@syncot/util@1.0.3) (2020-11-10)

**Note:** Version bump only for package @syncot/util





## [1.0.2](https://github.com/SyncOT/SyncOT/compare/@syncot/util@1.0.1...@syncot/util@1.0.2) (2020-11-03)

**Note:** Version bump only for package @syncot/util





## [1.0.1](https://github.com/SyncOT/SyncOT/compare/@syncot/util@1.0.0...@syncot/util@1.0.1) (2020-01-28)

**Note:** Version bump only for package @syncot/util





# [1.0.0](https://github.com/SyncOT/SyncOT/compare/@syncot/util@0.1.1...@syncot/util@1.0.0) (2019-12-04)


### Bug Fixes

* move most of the code to other packages ([ee609d5](https://github.com/SyncOT/SyncOT/commit/ee609d56bfa21d9aa43585c6f75f1acae62a5653))


### BREAKING CHANGES

* most of the APIs were moved to other packages

The removed APIs can now be found in the following modules:

- @syncot/error
- @syncot/events
- @syncot/stream
- @syncot/id
- @syncot/buffer
- @syncot/task-runner





## [0.1.1](https://github.com/SyncOT/SyncOT/compare/@syncot/util@0.1.0...@syncot/util@0.1.1) (2019-11-29)

**Note:** Version bump only for package @syncot/util





# [0.1.0](https://github.com/SyncOT/SyncOT/compare/@syncot/util@0.0.13...@syncot/util@0.1.0) (2019-10-21)


### Bug Fixes

* make BufferReader/Writer string encoding optional ([7bc5d18](https://github.com/SyncOT/SyncOT/commit/7bc5d181cb2004a14df0c753a3798ad7794aaec8))


### Features

* expose BufferReader/Writer length and offset ([a8cc936](https://github.com/SyncOT/SyncOT/commit/a8cc93693bd6e918ee11ad6867a1c826ee05a1e0))


### Performance Improvements

* speed up TSON ([71a9789](https://github.com/SyncOT/SyncOT/commit/71a978925decf44b35a48ec2eca2287ece458960))





## [0.0.13](https://github.com/SyncOT/SyncOT/compare/@syncot/util@0.0.12...@syncot/util@0.0.13) (2019-09-12)


### Bug Fixes

* the return type of whenEvent ([73b88a8](https://github.com/SyncOT/SyncOT/commit/73b88a8))





## [0.0.12](https://github.com/SyncOT/SyncOT/compare/@syncot/util@0.0.11...@syncot/util@0.0.12) (2019-09-11)


### Bug Fixes

* `run` does not call `cancel` anymore ([dc2389d](https://github.com/SyncOT/SyncOT/commit/dc2389d))
