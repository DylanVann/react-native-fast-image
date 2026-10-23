name: 'Restore Cache'
description: 'Restore Cache artifacts like dependencies and build outputs to improve workflow execution time'
author: 'GitHub'
inputs:
  path:
    description: 'A list of files, directories, and wildcard patterns to restore'
    required: true
  key:
    description: 'An explicit key for restoring the cache'
    required: true
  restore-keys:
    description: 'An ordered multiline string listing the prefix-matched keys, that are used for restoring stale cache if no cache hit occurred for key. Note `cache-hit` returns false in this case.'
    required: false
  enableCrossOsArchive:
    description: 'An optional boolean when enabled, allows windows runners to restore caches that were saved on other platforms'
    default: 'false'
    required: false
  fail-on-cache-miss:
    description: 'Fail the workflow if cache entry is not found'
    default: 'false'
    required: false
  lookup-only:
    description: 'Check if a cache entry exists for the given input(s) (key, restore-keys) without downloading the cache'
    default: 'false'
    required: false
outputs:
  cache-hit:
    description: 'A boolean value to indicate an exact match was found for the primary key'
  cache-primary-key:
    description: 'A resolved cache key for which cache match was attempted'
  cache-matched-key:
    description: 'Key of the cache that was restored, it could either be the primary key on cache-hit or a partial/complete match of one of the restore keys'
runs:
  using: 'node24'
  main: '../dist/restore-only/index.js'
branding:
  icon: 'archive'
  color: 'gray-dark'
