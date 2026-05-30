"use client";

import { useEffect, useState } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import type { Article } from "@/lib/dynamodb";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

export default function ArchitecturesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArticles() {
      try {
        const res = await fetch("/api/articles");
        const data = await res.json();
        if (data.articles) {
          const filtered = data.articles.filter((a: Article) => a.category === "System Architecture" || a.category === "Architecture");
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

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16 space-y-4"
      >
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          System <span className="text-primary">Architectures.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Deep dives into complete system architectures. Uncover how industry giants like Netflix and scalable services build their infrastructure entirely on AWS.
        </p>
      </motion.div>

      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Architecture Deep Dives</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex flex-col space-y-3">
                <Skeleton className="h-[200px] w-full rounded-xl bg-card" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article, i) => (
              <ArticleCard key={article.id} article={article} index={i} />
            ))}
            {articles.length === 0 && (
              <div className="col-span-full border-2 border-dashed border-border/50 rounded-xl p-12 text-center">
                <p className="text-lg text-muted-foreground">
                  No architecture deep-dives have been generated yet.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}