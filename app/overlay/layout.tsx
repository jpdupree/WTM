"use client";
import { useEffect } from "react";

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("overlay");
    return () => document.body.classList.remove("overlay");
  }, []);
  return <div className="p-4">{children}</div>;
}
