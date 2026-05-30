"use client";

import { useEffect, useState } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import type { Article } from "@/lib/dynamodb";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

const heroWords = ["Simplified.", "Clarified.", "Accelerated."];

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordIndex, setWordIndex] = useState(0);
  const [typedWord, setTypedWord] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchArticles() {
      try {
        const res = await fetch("/api/articles");
        const data = await res.json();
        if (data.articles) {
          // AWS Updates page shows all posts EXCEPT those explicitly generated for Companies or System Architectures
          const filtered = data.articles.filter((a: Article) => {
            return (
              a.category !== "Companies" &&
              a.category !== "Case Study" &&
              a.category !== "System Architecture"
            );
          });
          setArticles(filtered);
        }
      } catch (e) {
        console.error("Failed to fetch articles:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, []);

  useEffect(() => {
    const currentWord = heroWords[wordIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && typedWord === currentWord) {
      timeout = setTimeout(() => setDeleting(true), 10000);
    } else if (deleting && typedWord === "") {
      timeout = setTimeout(() => {
        setDeleting(false);
        setWordIndex((current) => (current + 1) % heroWords.length);
      }, 350);
    } else {
      timeout = setTimeout(() => {
        setTypedWord((current) => {
          if (deleting) return current.slice(0, -1);
          return currentWord.slice(0, current.length + 1);
        });
      }, deleting ? 55 : 90);
    }

    return () => clearTimeout(timeout);
  }, [deleting, typedWord, wordIndex]);

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16 space-y-4"
      >
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight font-mono">
          AWS Updates,
          <span className="text-primary inline-flex items-center">
            <span>{typedWord || "\u00A0"}</span>
            <span className="ml-1 inline-block h-[1em] w-[2px] bg-primary cursor-blink" />
          </span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Official AWS announcements, decoded. Understand what&apos;s new, why it
          matters, and how it can improve your existing systems.
        </p>
      </motion.div>

      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight font-mono">Latest Feed</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="flex flex-col space-y-3">
                <Skeleton className="h-[200px] w-full rounded-xl bg-card" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/4 bg-card" />
                  <Skeleton className="h-4 w-full bg-card" />
                  <Skeleton className="h-4 w-4/5 bg-card" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article, i) => (
              <ArticleCard key={article.id} article={article} index={i} />
            ))}
            {articles.length === 0 && (
              <p className="text-muted-foreground col-span-full text-center py-12">
                No updates found yet. Trigger a sync or deploy the infra!
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
