"use client";

import Link from "next/link";
import type { PublishPreflightIssue, PublishPreflightIssueKey } from "@/lib/publish/preflight";

type PreflightIssueListProps = {
  issues: PublishPreflightIssue[];
  idPrefix: string;
  filterKeys?: PublishPreflightIssueKey[];
};

export function PreflightIssueList({ issues, idPrefix, filterKeys }: PreflightIssueListProps) {
  const filtered = filterKeys ? issues.filter((issue) => filterKeys.includes(issue.key)) : issues;
  if (filtered.length === 0) return null;
  return (
    <div className="publish-preflight-list">
      {filtered.map((issue) => (
        <div key={`${idPrefix}-${issue.key}`} className="warn">
          {issue.message}{" "}
          {issue.href && issue.actionLabel ? (
            issue.href.startsWith("#") ? (
              <a href={issue.href} className="site-home-btn site-home-btn-ghost">
                {issue.actionLabel}
              </a>
            ) : (
              <Link href={issue.href} className="site-home-btn site-home-btn-ghost">
                {issue.actionLabel}
              </Link>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}
