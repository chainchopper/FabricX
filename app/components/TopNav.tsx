import { View, Text, Pressable } from "react-native";
import { Link, usePathname } from "expo-router";

export default function TopNav() {
  const pathname = usePathname();

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link href={href} asChild>
        <Pressable
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 8,
            backgroundColor: active ? "rgba(34,211,238,0.15)" : "transparent",
          }}
        >
          <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontSize: 14 }}>
            {label}
          </Text>
        </Pressable>
      </Link>
    );
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        backgroundColor: "rgba(17,24,39,0.8)",
        borderBottomWidth: 1,
        borderColor: "rgba(55,65,81,0.6)",
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 50,
      }}
    >
      <Link href="/" asChild>
        <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: "#22d3ee",
              opacity: 0.9,
            }}
          />
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Fabric
          </Text>
        </Pressable>
      </Link>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <NavLink href="/" label="Home" />
        <NavLink href="/dashboard" label="Dashboard" />
        <NavLink href="/plugins" label="Plugins" />
        <NavLink href="/profile" label="Profile" />
      </View>
    </View>
  );
}