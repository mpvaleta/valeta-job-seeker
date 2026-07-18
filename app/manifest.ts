import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Valeta's Job Seeker",
    short_name: "Valeta Jobs",
    description:
      "Personal job-search command center for tailored resumes, cover letters, application tracking, and company monitoring.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f0e",
    theme_color: "#0e0f0e",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
