import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Text, View } from "react-native";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0D1020" }}>
        <StatusBar style="light" />
        {publishableKey ? (
          <ClerkProvider
            publishableKey={publishableKey}
            tokenCache={tokenCache}
          >
            <Slot />
          </ClerkProvider>
        ) : (
          <View
            style={{ flex: 1, justifyContent: "center", padding: 28, gap: 12 }}
          >
            <Text style={{ color: "#A78BFA", fontSize: 24, fontWeight: "800" }}>
              NOXEN
            </Text>
            <Text style={{ color: "#FF7D89" }}>
              Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in mobile/.env to start.
            </Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
