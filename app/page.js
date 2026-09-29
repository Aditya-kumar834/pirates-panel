"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const ok = typeof window !== "undefined" && localStorage.getItem("ab_auth") === "1";
    router.replace(ok ? "/dashboard" : "/login");
  }, [router]);
  return <div className="container">Loading...</div>;
}
