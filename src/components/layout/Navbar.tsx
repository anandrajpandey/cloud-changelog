"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudRain, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Article } from "@/lib/dynamodb";

function articleSearchText(article: Article) {
  return [article.title, (article.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function Navbar() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchArticles() {
      setLoading(true);
      try {
        const res = await fetch("/api/articles");
        const data = await res.json();
        if (active && data.articles) {
          setArticles(data.articles);
        }
      } catch (error) {
        console.error("Failed to load search articles:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchArticles();

    return () => {
      active = false;
    };
  }, []);

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    return articles
      .map((article) => {
        const haystack = articleSearchText(article);
        const score = tokens.reduce(
          (count, token) => count + (haystack.includes(token) ? 1 : 0),
          0,
        );
        return { article, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ article }) => article);
  }, [articles, query]);

  const showDropdown = focused && query.trim().length > 0;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container h-16 flex items-center justify-between mx-auto px-4 gap-6">
        <Link href="/" className="flex items-center gap-2 font-mono shrink-0">
          <CloudRain className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg tracking-tight hidden md:block">
            IncentiveX
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground font-mono">
          <Link href="/" className="hover:text-foreground transition-colors">
            Updates
          </Link>
          <Link
            href="/companies"
            className="hover:text-foreground transition-colors"
          >
            Companies
          </Link>
          <Link
            href="/architectures"
            className="hover:text-foreground transition-colors"
          >
            Architectures
          </Link>
        </div>

        <div className="relative hidden lg:block w-full max-w-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={
                loading ? "Loading articles..." : "Search articles..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions[0]) {
                  router.push(`/article/${suggestions[0].slug}`);
                  setQuery("");
                }
              }}
              className="bg-card w-full pl-9 pr-9 transition-all focus:ring-primary focus-visible:ring-primary font-sans"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden">
              {suggestions.length > 0 ? (
                <div className="max-h-96 overflow-auto">
                  {suggestions.map((article) => (
                    <Link
                      key={article.id}
                      href={`/article/${article.slug}`}
                      className="block px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors"
                      onMouseDown={() => setQuery("")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-heading text-sm font-semibold text-foreground line-clamp-2">
                            {article.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {article.category}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">
                          Match
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No related articles found.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
