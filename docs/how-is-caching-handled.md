# How is caching handled?

FastImage keeps the images it downloads, so an image it has shown before shows again without being downloaded. This page explains how, and how to control it. Each function and option is described in the [README](../README.md).

## Where images are kept

|                                                  | iOS (SDWebImage)                                                                                                     | Android (Glide)                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Memory**: decoded images, shown at once        | No limit by default; emptied when the system is low on memory.                                                       | Sized from the screen. Images are kept at the size a view shows them, so a view of another size decodes again. |
| **Disk**: the downloaded files                   | No size limit, and images unused for a week are removed (counted from when they were stored before SDWebImage 5.21). | 250 MB, removing the least recently used images first. No age limit.                                           |
| **`cache: 'web'` images**: an HTTP cache instead | 50 MB, following the server's cache headers.                                                                         | 50 MB, following the server's cache headers.                                                                   |

Set the limits your app starts with in its native config (or with the Expo plugin), and change them while it runs with [`FastImage.configureCache`](../README.md#configurecachelimits), which saves the change; call it without limits to see the ones in effect and how much the disk cache uses. [`source.memoryCache: false`](../README.md#sourcememorycache) keeps an image on disk only, e.g. a large photo shown once.

## What an image is cached under

An image is cached under its url. If the url changes while the image stays the same, as with signed urls that carry a token or an expiry, give it a [`source.cacheKey`](../README.md#sourcecachekey) that identifies the image instead, e.g. its id. Headers aren't part of the key.

## When an image changes

FastImage treats an image at a url (or `cacheKey`) as never changing: that's what makes it fast. When an image changes:

- **Give it a new url or `cacheKey`**, e.g. `` `avatar-${user.id}-${user.avatarUpdatedAt}` `` with a version or date from your API. The app shows the cached image until it has the new key, then loads the new image. The old one is removed from the cache in time, by its limits.
- **Or use [`cache: 'web'`](../README.md#sourcecache)** to follow the server's HTTP cache headers, as a browser does: the image is checked with the server when it loads.

There's no way to remove a single image from the cache: Glide can't remove one image reliably on Android (its downloaded file, its resized copies and its memory entry). [`FastImage.clearDiskCache`](../README.md#cleardiskcache) and [`clearMemoryCache`](../README.md#clearmemorycache) remove every image, e.g. when a user logs out.

## Loading images ahead

[`FastImage.preload`](../README.md#preloadsources) downloads images before they're shown, a few at a time so it doesn't hold up the images on screen, and resolves with a result for each. By default they're also decoded into memory, to show at once; with `memoryCache: false` they're only downloaded, which uses much less memory for many or large images.

## Files

- [`FastImage.getCachePath`](../README.md#getcachepathsource) gives an image's file in the cache, downloading it first if needed, e.g. to share or upload it. With `cache: 'cacheOnly'` it only checks whether the image is cached. For `cache: 'web'` images, it gives the file on disk without checking it with the server, as a view would. The file belongs to the cache: copy it to keep it.
- [`FastImage.writeToCache`](../README.md#writetocachesource-file) stores a local image file as a source's image, e.g. a photo the user just uploaded, so it shows without being downloaded.

## Offline

The cache is kept for speed, not for offline use: the system or the cache's limits can remove images at any time. [`cache: 'cacheOnly'`](../README.md#sourcecache) shows an image only if it's cached, without a request. To be sure an image is available offline, keep your own copy (e.g. copy the file from `getCachePath` into your app's documents) and show it as a `file://` uri.

## Failed loads

A url that failed to load is tried again the next time it's shown or preloaded, on both platforms. A response that isn't an image, like the page a Wi-Fi login portal sends instead with status 200, isn't kept in the cache, so it doesn't break the image once the network is back.
