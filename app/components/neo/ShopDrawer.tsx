import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, TextInput, Platform } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { useDemoData } from "../../utils/demoMode";

interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: "experience" | "asset" | "theme" | "device" | "premium";
  price: number;
  currency: "credits" | "usd";
  featured: boolean;
  rating: number;
  reviews: number;
  purchased: boolean;
}

export default function ShopDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width, parked } = getAnim("shop");
  const haptics = useHaptics();
  const audio = useAudioCues();
  // Sample items/credits only render when the demo-data flag is on (Slice 1).
  const demoData = useDemoData();

  const [activeTab, setActiveTab] = useState<"featured" | "experiences" | "assets" | "purchased">("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const [userCredits] = useState(1250);

  const mockItems: ShopItem[] = [
    {
      id: "1",
      name: "Neon Dreams Pack",
      description: "Cyberpunk-themed visual effects and soundscapes",
      category: "experience",
      price: 499,
      currency: "credits",
      featured: true,
      rating: 4.9,
      reviews: 234,
      purchased: false,
    },
    {
      id: "2",
      name: "Premium Haptic Library",
      description: "150+ professional haptic patterns",
      category: "asset",
      price: 9.99,
      currency: "usd",
      featured: true,
      rating: 4.7,
      reviews: 89,
      purchased: false,
    },
    {
      id: "3",
      name: "S3 Matrix Pro Edition",
      description: "Hardware device with enhanced features",
      category: "device",
      price: 49.99,
      currency: "usd",
      featured: false,
      rating: 4.8,
      reviews: 156,
      purchased: false,
    },
    {
      id: "4",
      name: "Midnight Theme",
      description: "Dark elegant color scheme with animations",
      category: "theme",
      price: 199,
      currency: "credits",
      featured: false,
      rating: 4.6,
      reviews: 421,
      purchased: true,
    },
    {
      id: "5",
      name: "Creator Studio Pro",
      description: "Unlock advanced composition tools",
      category: "premium",
      price: 19.99,
      currency: "usd",
      featured: true,
      rating: 4.9,
      reviews: 312,
      purchased: false,
    },
    {
      id: "6",
      name: "Particle Effects Bundle",
      description: "20 high-quality particle systems",
      category: "asset",
      price: 349,
      currency: "credits",
      featured: false,
      rating: 4.5,
      reviews: 178,
      purchased: false,
    },
  ];

  const items: ShopItem[] = demoData ? mockItems : [];
  const displayedCredits = demoData ? userCredits : 0;

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTabItems = () => {
    switch (activeTab) {
      case "featured":
        return filteredItems.filter((i) => i.featured);
      case "experiences":
        return filteredItems.filter((i) => i.category === "experience");
      case "assets":
        return filteredItems.filter((i) => i.category === "asset" || i.category === "theme");
      case "purchased":
        return filteredItems.filter((i) => i.purchased);
      default:
        return filteredItems;
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const handlePurchase = (item: ShopItem) => {
    haptics.impactHeavy();
    audio.success();
    // Purchase logic would go here
  };

  const getCategoryEmoji = (category: ShopItem["category"]) => {
    const emojis = {
      experience: "🎨",
      asset: "📦",
      theme: "🎭",
      device: "📱",
      premium: "⭐",
    };
    return emojis[category];
  };

  return (
    <Animated.View
      pointerEvents={parked ? "none" : "box-none"}
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        display: parked ? "none" : "flex",
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(6,10,22,0.96)",
          paddingTop: 56,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable
              onPress={() => { haptics.impactLight(); audio.click(); back(); }}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.35)",
                marginRight: 8,
              }}
            >
              <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
            </Pressable>
            <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Shop</Text>
          </View>
          
          {/* Credits Display */}
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: "rgba(34,211,238,0.2)",
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.5)",
            }}
          >
            <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 12 }}>
              💎 {displayedCredits} Credits
            </Text>
          </View>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Premium content and experiences
        </Text>

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 6 }}>
          {(["featured", "experiences", "assets", "purchased"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: activeTab === tab ? "rgba(34,211,238,0.8)" : "rgba(148,163,184,0.25)",
                backgroundColor: activeTab === tab ? "rgba(34,211,238,0.15)" : "transparent",
              }}
            >
              <Text
                style={{
                  color: activeTab === tab ? "#22d3ee" : "#9ca3af",
                  fontWeight: activeTab === tab ? "700" : "600",
                  textAlign: "center",
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search Bar */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search shop..."
            placeholderTextColor="#6b7280"
            style={{
              backgroundColor: "rgba(0,0,0,0.3)",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.25)",
              borderRadius: 8,
              padding: 10,
              color: "white",
            }}
          />
        </View>

        {/* Content Area */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
          <View style={{ gap: 12 }}>
            {getTabItems().length === 0 ? (
              <Text style={{ color: "#9ca3af", textAlign: "center", marginTop: 20 }}>
                {activeTab === "purchased"
                  ? "No purchased items yet. Browse the shop to find great content!"
                  : !demoData && !searchQuery
                    ? "Nothing in the shop yet — new experiences will appear here."
                    : "No items found. Try a different search or category."}
              </Text>
            ) : (
              getTabItems().map((item) => (
                <View
                  key={item.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: item.featured
                      ? "rgba(251,191,36,0.5)"
                      : item.purchased
                      ? "rgba(16,185,129,0.5)"
                      : "rgba(148,163,184,0.25)",
                    backgroundColor: item.featured
                      ? "rgba(251,191,36,0.08)"
                      : item.purchased
                      ? "rgba(16,185,129,0.08)"
                      : "rgba(2,8,23,0.5)",
                  }}
                >
                  {item.featured && (
                    <View
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        backgroundColor: "rgba(251,191,36,0.3)",
                        borderWidth: 1,
                        borderColor: "rgba(251,191,36,0.6)",
                      }}
                    >
                      <Text style={{ color: "#fbbf24", fontSize: 10, fontWeight: "700" }}>FEATURED</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 24, marginRight: 8 }}>{getCategoryEmoji(item.category)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{item.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Text style={{ color: "#fbbf24", fontSize: 12, marginRight: 6 }}>
                          ★ {item.rating}
                        </Text>
                        <Text style={{ color: "#9ca3af", fontSize: 11 }}>({item.reviews} reviews)</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={{ color: "#cbd5e1", fontSize: 13, marginBottom: 10 }}>{item.description}</Text>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 16 }}>
                      {item.currency === "credits" ? `💎 ${item.price}` : `$${item.price}`}
                    </Text>
                    
                    {item.purchased ? (
                      <View
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: "rgba(16,185,129,0.2)",
                          borderWidth: 1,
                          borderColor: "rgba(16,185,129,0.5)",
                        }}
                      >
                        <Text style={{ color: "#10b981", fontWeight: "700" }}>✓ Owned</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handlePurchase(item)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: "rgba(34,211,238,0.2)",
                          borderWidth: 1,
                          borderColor: "rgba(34,211,238,0.5)",
                        }}
                      >
                        <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Purchase</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}