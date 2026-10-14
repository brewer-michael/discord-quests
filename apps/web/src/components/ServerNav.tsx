"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "", label: "Overview" },
  { href: "/routing", label: "Who does what" },
  { href: "/settings", label: "Settings & budget" },
  { href: "/usage", label: "Usage" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/activity", label: "Activity" },
];

export function ServerNav({ guildId }: { guildId: string }) {
  const path = usePathname();
  const base = `/servers/${guildId}`;
  return (
    <nav className="side-nav" aria-label="Server setup">
      {LINKS.map((l) => {
        const href = base + l.href;
        const active =
          l.href === "" ? path === base || path.startsWith(`${base}/providers`) : path.startsWith(href);
        return (
          <Link key={l.href} href={href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
