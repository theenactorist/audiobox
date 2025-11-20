# Environment Variables Setup

## Frontend (.env.local)

```bash
# Signaling Server URL
NEXT_PUBLIC_SIGNALING_URL=http://localhost:3001

# Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH= # Generated using scripts/hash-password.js
```

## Generating Password Hash

Run this command to generate a password hash:

```bash
node scripts/hash-password.js YOUR_SECURE_PASSWORD
```

Copy the output hash and add it to your `.env.local` file as `ADMIN_PASSWORD_HASH`.

## Production Environment Variables

### Vercel:
- `NEXT_PUBLIC_SIGNALING_URL`: Your Render signaling server URL
- `ADMIN_USERNAME`: Your username (e.g., "admin")
- `ADMIN_PASSWORD_HASH`: Your password hash

### Render:
- `FRONTEND_URL`: Your Vercel URL
- `PORT`: Auto-assigned by Render
