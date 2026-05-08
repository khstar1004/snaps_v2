# snaps NodeJS SDK

This is the NodeJS SDK for snaps public API workflows.

You can start by installing the package:

```bash
npm install @snaps/node
```

## Usage
```typescript
import Snaps from '@snaps/node';
const snaps = new Snaps('your api key', 'your self-hosted instance (optional)');
```

The available methods are:
- `post(posts: CreatePostDto)` - Schedule a social post through snaps
- `postList(filters: GetPostsDto)` - Get a list of posts
- `upload(file: Buffer, extension: string)` - Upload a media file
- `integrations()` - Get a list of connected channels
- `deletePost(id: string)` - Delete a post by ID

Alternatively you can use the SDK with curl against your self-hosted snaps public API URL.
