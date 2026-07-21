/**
 * Component-project setup. RTL's automatic cleanup only registers itself
 * when test globals exist; we run without globals, so unmount explicitly or
 * every render accumulates in document.body and queries cross-match.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
