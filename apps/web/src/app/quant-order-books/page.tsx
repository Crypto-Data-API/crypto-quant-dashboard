import type { Metadata } from "next";
import { BooksView } from "@/features/books/books-view";

export const metadata: Metadata = { title: "Order Books" };

export default function OrderBooksPage() {
  return <BooksView />;
}
