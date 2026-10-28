// Pins the release workflow's security shape, so a pull request that gives
// the attest job an environment, the publish job a checkout, either job an
// install or another action alongside its id-token, or any job an extra
// permission turns CI red.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const WORKFLOWS = join(import.meta.dirname, "..", ".github", "workflows");
const PINNED_USES = /uses: \S+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;
/** Each flag ties the bundle to this repository, workflow, tag, commit or runner. */
const VERIFY_CONSTRAINTS = [
  '--repo "$GITHUB_REPOSITORY"',
  '--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/release.yml"',
  '--source-ref "$GITHUB_REF"',
  '--source-digest "$GITHUB_SHA"',
  "--deny-self-hosted-runners",
];
const INSTALLS = /\b(npm (ci|install|i|exec|update)|npx|yarn|pnpm)\b/;

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  "continue-on-error"?: unknown;
}

interface Job {
  needs?: string | string[];
  environment?: unknown;
  permissions?: Record<string, string>;
  "continue-on-error"?: unknown;
  steps: Step[];
}

const jobs: Record<string, Job> = parse(
  readFileSync(join(WORKFLOWS, "release.yml"), "utf8"),
).jobs;

function job(name: string): Job {
  const found = jobs[name];
  if (!found) throw new Error(`release.yml has no ${name} job`);
  return found;
}

/**
 * The properties that decide whether a job can mint a publish credential or
 * run repository code. Pinning the exact actions rules out a checkout or any
 * other action, and continue-on-error would let a failed check, such as the
 * attestation verify, pass.
 */
function shape(j: Job) {
  return {
    environment: j.environment ?? "none",
    continueOnError: [j, ...j.steps].some((s) => "continue-on-error" in s),
    installs: j.steps.filter((s) => INSTALLS.test(s.run ?? "")).length,
    actions: j.steps.flatMap((s) => (s.uses ? [s.uses.split("@")[0]] : [])),
    permissions: j.permissions,
  };
}

describe("release workflow", () => {
  test("jobs run build, attest, publish, then github-release", () => {
    expect(Object.keys(jobs)).toEqual([
      "build",
      "attest",
      "publish",
      "github-release",
    ]);
    expect(
      [job("attest"), job("publish"), job("github-release")].map((j) =>
        [j.needs].flat(),
      ),
    ).toEqual([["build"], ["build", "attest"], ["publish"]]);
  });

  test("the attest job cannot mint a publish credential", () => {
    expect(shape(job("attest"))).toEqual({
      environment: "none",
      continueOnError: false,
      installs: 0,
      actions: [
        "actions/download-artifact",
        "actions/attest",
        "actions/upload-artifact",
      ],
      permissions: {
        contents: "read",
        "id-token": "write",
        attestations: "write",
      },
    });
  });

  // Dropping any of these would let a bundle from another repository,
  // workflow, tag, commit or runner through to publish.
  test("the attest job verifies every identity constraint", () => {
    const verify = job("attest").steps.find(
      (s) => s.name === "Verify the attestation",
    );
    for (const flag of VERIFY_CONSTRAINTS) {
      expect(verify?.run).toContain(flag);
    }
  });

  test("the publish job runs no repository code", () => {
    expect(shape(job("publish"))).toEqual({
      environment: "npm",
      continueOnError: false,
      installs: 0,
      actions: ["actions/download-artifact", "actions/setup-node"],
      permissions: { contents: "read", "id-token": "write" },
    });
  });

  test("the GitHub release carries the tarball and its attestation", () => {
    const release = job("github-release");
    expect(shape(release).actions).toEqual([
      "actions/download-artifact",
      "actions/download-artifact",
      "actions/download-artifact",
    ]);
    const run = release.steps.map((s) => s.run ?? "").join("\n");
    expect(run).toContain('"$file" "$file.sigstore.json"');
  });

  test("build and github-release keep their permissions", () => {
    expect({
      build: job("build").permissions,
      "github-release": job("github-release").permissions,
    }).toEqual({
      build: { contents: "read" },
      "github-release": { contents: "write" },
    });
  });

  test("every action is pinned to a SHA", () => {
    for (const file of readdirSync(WORKFLOWS)) {
      const lines = readFileSync(join(WORKFLOWS, file), "utf8")
        .split("\n")
        .filter((line) => line.includes("uses:"));
      for (const line of lines) {
        expect(line.trim(), `${file}: ${line.trim()}`).toMatch(PINNED_USES);
      }
    }
  });
});
