# How is caching handled?

In the readme it says "Aggressively cache images.". What does this mean?

This library treats image urls as immutable.
That means it assumes the data located at a given url will not change.
This is ideal for performance.

The way this would work in practice for something like a user profile picture is:

- Request user from API.
- Receive JSON representing the user containing a `profilePicture` property that is the url of the profile picture.
- Display the profile picture.

So what happens if the user wants to change their profile picture?

- User uploads a new profile picture, it gets a new url on the backend.
- Update a field in a database.

Next time the app is opened:

- Display the cached profile picture immediately.
- Request the user json again (this time it will have the new profile picture url).
- Display the new profile picture.

## How is the cache cleared?

As the app is used the cache fills up. When the cache reaches its maximum size the least frequently used images will be purged from the cache. You generally do not need to manually manage the cache.
