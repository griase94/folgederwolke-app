import { InMemoryMockFileStorage } from "./in-memory-mock-impl.js";
import { runConformanceSuite } from "./storage.conformance.js";

runConformanceSuite("in-memory-mock", () => new InMemoryMockFileStorage());
