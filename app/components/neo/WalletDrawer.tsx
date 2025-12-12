import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, Platform } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { formatRelativeTime } from "../../utils/timeFormatters";

interface Asset {
  id: string;
  name: string;
  type: "nft" | "token" | "credit" | "item";
  quantity: number;
  value: number;
  currency: string;
  thumbnail?: string;
}

interface Transaction {
  id: string;
  type: "purchase" | "earn" | "transfer" | "reward";
  amount: number;
  currency: string;
  description: string;
  timestamp: Date;
  status: "completed" | "pending" | "failed";
}

export default function WalletDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("wallet");
  const haptics = useHaptics();
  const audio = useAudioCues();
  
  const [activeTab, setActiveTab] = useState<"balance" | "assets" | "history">("balance");

  const mockAssets: Asset[] = [
    { id: "1", name: "Fabric Credits", type: "credit", quantity: 1250, value: 1250, currency: "credits" },
    { id: "2", name: "Premium Access", type: "token", quantity: 1, value: 19.99, currency: "usd" },
    { id: "3", name: "Neon Dreams NFT", type: "nft", quantity: 1, value: 0.5, currency: "eth" },
    { id: "4", name: "Galaxy Background", type: "item", quantity: 1, value: 499, currency: "credits" },
    { id: "5", name: "Haptic Pack Pro", type: "item", quantity: 1, value: 349, currency: "credits" },
  ];

  const mockTransactions: Transaction[] = [
    {
      id: "1",
      type: "purchase",
      amount: -499,
      currency: "credits",
      description: "Purchased Galaxy Background",
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      status: "completed",
    },
    {
      id: "2",
      type: "earn",
      amount: 100,
      currency: "credits",
      description: "Daily login bonus",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
      status: "completed",
    },
    {
      id: "3",
      type: "purchase",
      amount: -19.99,
      currency: "usd",
      description: "Premium Access Upgrade",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
      status: "completed",
    },
    {
      id: "4",
      type: "reward",
      amount: 250,
      currency: "credits",
      description: "Achievement unlocked: Creative Master",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
      status: "completed",
    },
    {
      id: "5",
      type: "transfer",
      amount: -100,
      currency: "credits",
      description: "Gift to @user123",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72),
      status: "completed",
    },
  ];

  const totalCredits = mockAssets.find((a) => a.type === "credit")?.quantity || 0;
  const totalValue = mockAssets.reduce((sum, asset) => {
    if (asset.currency === "credits") return sum;
    if (asset.currency === "usd") return sum + asset.value;
    return sum;
  }, 0);

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const formatAssetValue = (asset: Asset) => {
    if (asset.currency === "credits") return `💎 ${asset.value}`;
    if (asset.currency === "usd") return `$${asset.value}`;
    return `${asset.value} ${asset.currency.toUpperCase()}`;
  };
  
  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getTransactionColor = (type: Transaction["type"], amount: number) => {
    if (amount > 0) return "#10b981";
    if (type === "purchase") return "#22d3ee";
    if (type === "transfer") return "#f59e0b";
    return "#9ca3af";
  };

  const getAssetTypeEmoji = (type: Asset["type"]) => {
    const emojis = {
      nft: "🎨",
      token: "🪙",
      credit: "💎",
      item: "📦",
    };
    return emojis[type];
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(6,10,22,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, paddingHorizontal: 16 }}>
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
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Wallet</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Manage your assets and transactions
        </Text>

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          {(["balance", "assets", "history"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
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
                  fontSize: 13,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content Area */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
          {activeTab === "balance" && (
            <View style={{ gap: 12 }}>
              {/* Total Balance Card */}
              <View
                style={{
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.5)",
                  backgroundColor: "rgba(34,211,238,0.08)",
                }}
              >
                <Text style={{ color: "#93c5fd", fontSize: 13, marginBottom: 4 }}>Total Balance</Text>
                <Text style={{ color: "white", fontWeight: "800", fontSize: 28, marginBottom: 12 }}>
                  💎 {totalCredits}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => { haptics.impactMedium(); audio.click(); }}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(16,185,129,0.2)",
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.5)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#10b981", fontWeight: "700" }}>Add Funds</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { haptics.impactMedium(); audio.click(); }}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(34,211,238,0.2)",
                      borderWidth: 1,
                      borderColor: "rgba(34,211,238,0.5)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Transfer</Text>
                  </Pressable>
                </View>
              </View>

              {/* USD Value Card */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 4 }}>Estimated Value</Text>
                <Text style={{ color: "white", fontWeight: "700", fontSize: 20 }}>
                  ${totalValue.toFixed(2)} USD
                </Text>
              </View>

              {/* Quick Stats */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Quick Stats</Text>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#9ca3af" }}>Total Earned</Text>
                    <Text style={{ color: "#10b981", fontWeight: "600" }}>+350 credits</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#9ca3af" }}>Total Spent</Text>
                    <Text style={{ color: "#22d3ee", fontWeight: "600" }}>-599 credits</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#9ca3af" }}>Assets Owned</Text>
                    <Text style={{ color: "white", fontWeight: "600" }}>{mockAssets.length}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {activeTab === "assets" && (
            <View style={{ gap: 12 }}>
              {mockAssets.map((asset) => (
                <View
                  key={asset.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    backgroundColor: "rgba(2,8,23,0.5)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 32, marginRight: 12 }}>{getAssetTypeEmoji(asset.type)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{asset.name}</Text>
                      <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                        {asset.type.toUpperCase()} • Qty: {asset.quantity}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: "#22d3ee", fontWeight: "600" }}>
                      {formatAssetValue(asset)}
                    </Text>
                    <Pressable
                      onPress={() => { haptics.impactLight(); audio.click(); }}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        backgroundColor: "rgba(34,211,238,0.2)",
                        borderWidth: 1,
                        borderColor: "rgba(34,211,238,0.5)",
                      }}
                    >
                      <Text style={{ color: "#22d3ee", fontSize: 12, fontWeight: "600" }}>View</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === "history" && (
            <View style={{ gap: 12 }}>
              {mockTransactions.map((tx) => (
                <View
                  key={tx.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    backgroundColor: "rgba(2,8,23,0.5)",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>{tx.description}</Text>
                      <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                        {tx.type.toUpperCase()} • {formatRelativeTime(tx.timestamp)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: getTransactionColor(tx.type, tx.amount),
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.currency === "credits" ? `💎 ${tx.amount}` : `$${Math.abs(tx.amount)}`}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: tx.status === "completed" ? "rgba(16,185,129,0.2)" : "rgba(251,191,36,0.2)",
                      borderWidth: 1,
                      borderColor: tx.status === "completed" ? "rgba(16,185,129,0.5)" : "rgba(251,191,36,0.5)",
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text
                      style={{
                        color: tx.status === "completed" ? "#10b981" : "#fbbf24",
                        fontSize: 10,
                        fontWeight: "600",
                      }}
                    >
                      {tx.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}