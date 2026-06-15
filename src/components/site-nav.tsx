"use client";

import { Menu, Shield, X } from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "#practice", label: "练习场" },
  { href: "#foundation", label: "Skills" },
  { href: "#prompts", label: "Prompt" },
  { href: "#assessment", label: "问卷" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <a className="site-brand" href="#top">
          <Shield size={18} />
          <span>Neverland</span>
        </a>
        <nav aria-label="页面导航" className="site-nav-links desktop-only">
          {navItems.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <button
          aria-expanded={open}
          aria-label={open ? "关闭菜单" : "打开菜单"}
          className="site-nav-toggle mobile-only"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open ? (
        <nav aria-label="移动端导航" className="site-nav-drawer mobile-only">
          {navItems.map((item) => (
            <a href={item.href} key={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
