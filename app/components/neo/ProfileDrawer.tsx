import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useProfileDrawer } from "./ProfileDrawerContext";

const WIDTH = 380;

export default function ProfileDrawer() {
  const { open, close } = useProfileDrawer();
  const tx = useRef(new Animated.Value(WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue: WIDTH, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [open, tx, backdrop]);

  return (
    <>
      {open ? (
        <Animated.View style={{ position: "absolute", inset: 0 as unknown as number, backgroundColor: "rgba(0,0,0,0.5)", opacity: backdrop, zIndex: 86 }}>
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: WIDTH, transform: [{ translateX: tx }], zIndex: 87 }}
        pointerEvents="box-none"
      >
        <View
          style={{
            position: "absolute",
            top: 0, bottom: 0, right: 0,
            width: WIDTH,
            backgroundColor: "rgba(10,14,28,0.96)",
            borderLeftColor: "rgba(34,211,238,0.35)",
            borderLeftWidth: 1,
            paddingTop: 56,
            paddingHorizontal: 16,
          }}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Image source={require("../../../logo.png")} style={{ width: 96, height: 96, borderRadius: 16 }} />
              <Text style={{ color: "white", fontWeight: "800", marginTop: 8 }}>Weaver</Text>
              <Text style={{ color: "#93c5fd" }}>Online</Text>
            </View>

            <View style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <Text style={{ color: "#e5e7eb" }}>Bio</Text>
              <Text style={{ color: "#9ca3af", marginTop: 6 }}>
                Multi-sensory explorer. Building with Fabric.
              </Text>
            </View>

            <View style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <Text style={{ color: "#e5e7eb" }}>Preferences</Text>
              <Text style={{ color: "#9ca3af", marginTop: 6 }}>
                Personalization lives in Global Controls (coming next).
              </Text>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </>
  );
}