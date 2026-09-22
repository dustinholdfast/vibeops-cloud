# Noxen Cloud for Android

Expo/React Native client for the existing Noxen Cloud account. The app includes Clerk sign-in, workspace switching, project updates, the daily brief, and uptime status. It uses the existing `https://noxencloud.com` API and the same Clerk instance as the web app.

## Set up

1. In the Clerk dashboard for Noxen Cloud, enable **Native API** and register an Android native application with package `com.noxencloud.mobile`. Use the callback Clerk shows for this package. The web and mobile publishable keys must refer to the same Clerk instance.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` to that instance's publishable key. No secret key goes in the mobile app.
3. Run `npm install` and `npm run android` from this directory. An Android emulator or connected device is needed. For Expo Go, run `npm start` and open the QR code on an Android device.

The mobile app uses hosted Clerk sign-in. API requests include the Clerk session token as a Bearer token. Each team workspace request includes `x-vibeops-workspace`; the server checks membership and permissions.

The daily brief calls `/api/mobile/brief`, which reuses the web dashboard ranking. Until that route is deployed, the app calculates the same recommendation from the project list. Uptime uses `/api/monitors`.

## Verify

```bash
npx tsc --noEmit
npx expo export --platform android
```

For a release build, create an Android development or production build and test sign-in, project updates, workspace isolation, and uptime against the production Clerk instance. The repo does not contain signing credentials or an EAS project configuration.
