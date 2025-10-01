import React from "react";
import { Pressable, Text, View } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";

export default function ShopDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("shop");

  return (
    <View pointerEvents="box-none">
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width, transform: [{ translateX: tx }], zIndex: 200 }} pointerEvents="box-none">
        <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width, backgroundColor: "rgba(6,10,22,0.96)", borderRightColor: "rgba(34,211,238,0.35)", borderRightWidth: 1, paddingTop: 56, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Pressable onPress={() => back()} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", marginRight: 8 }}>
              <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
            </Pressable>
            <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Shop</Text>
          </View>
          <Text style={{ color: "#93c5fd", marginBottom: 12 }}>Marketplace integrations will appear here.</Text>
        </View>
      </View>
    </View>
  );
}