"use client";

import Link from "next/link";
import {
  PERSONAL_V1_LIBRARY_SECTIONS,
  type PersonalV1LibrarySectionId,
} from "@/lib/personal-v1/library-navigation";
import styles from "@/styles/personal-v1.module.css";

type PersonalV1LibraryNavProps = {
  activeSection: PersonalV1LibrarySectionId;
};

export function PersonalV1LibraryNav({ activeSection }: PersonalV1LibraryNavProps) {
  return (
    <nav className={styles.librarySectionNav} aria-label="라이브러리 구분">
      {PERSONAL_V1_LIBRARY_SECTIONS.map((section) => {
        const active = section.id === activeSection;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`${styles.librarySectionLink} ${active ? styles.librarySectionLinkActive : ""}`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
