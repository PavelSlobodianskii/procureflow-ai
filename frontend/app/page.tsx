import { redirect } from "next/navigation";

// The only screen in this slice is the purchase request form.
export default function HomePage() {
  redirect("/requests/new");
}
