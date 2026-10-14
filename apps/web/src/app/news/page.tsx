import type { Metadata } from "next";
import { NewsView } from "@/features/news/news-view";

export const metadata: Metadata = { title: "News" };

export default function NewsPage() {
  return <NewsView />;
}
