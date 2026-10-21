### Java specifics for coding-practices

Checked exceptions, mutable-by-default classes and a large concurrency library mean most Java defects are a swallowed exception, a leaked `AutoCloseable`, or state shared without a happens-before edge.

### Always check (java)

1. A `catch` swallows: empty body, log-only, `catch (Exception | Throwable e)` around a narrow operation, or a rethrow that drops the cause (`new RuntimeException(msg)` instead of `(msg, e)`). **Major** when the result is used afterwards. Read every handler in the diff; `javac -Xlint:all` is silent here, Error Prone or SpotBugs (`DE_MIGHT_IGNORE`, `REC_CATCH_EXCEPTION`) report it when the build has them.
2. An `AutoCloseable` (stream, `Connection`, `Statement`, `ResultSet`, `Files.lines`/`Files.list`, `Scanner`, `ZipFile`) opened outside try-with-resources, or closed in a `finally` that can itself throw and mask the original. **Major**. Grep `new FileInputStream`, `getConnection(`, `Files.lines(`, `Files.newBufferedReader(` not inside `try (`; SpotBugs `OBL_UNSATISFIED_OBLIGATION` when available.
3. `Optional` misuse: `.get()` with no presence check, `Optional` as a field or parameter, `Optional.of(nullable)`, `orElse(expensiveCall())` evaluated eagerly. **Major** for an unguarded `.get()`; **Minor** otherwise. Grep `.get()` on Optional receivers and `Optional<` in field and parameter positions.
4. `equals` without `hashCode` or the reverse, a mutable object used as a `HashMap`/`HashSet` key, or `==` on `String`, boxed numbers or value objects. **Major**. Error Prone (`EqualsHashCode`, `ReferenceEquality`) or SpotBugs (`HE_EQUALS_USE_HASHCODE`) when available; otherwise read every `equals` override and object `==` in the diff.
5. State published across threads without `final`, `volatile`, a lock or a concurrent collection: lazy singleton without `volatile` double-check, `HashMap` read while written, check-then-act on a `ConcurrentHashMap` instead of `computeIfAbsent`, a shared `SimpleDateFormat`. **Major**. List every writer; SpotBugs `IS2_INCONSISTENT_SYNC` and `STCAL_*` when available.
6. An `ExecutorService` or scheduler created without `shutdown()` on every exit path, or `Future.get()`/`CompletableFuture.join()` with no timeout. **Major**. Trace each `Executors.new*` to its shutdown and each `.get()` to a deadline.
7. A nullable value crosses a boundary unchecked: `Map.get`, `findFirst().get()`, unboxing an `Integer`, a parameter without the nullability annotation the tree uses (`@Nullable`/`@NonNull`). **Major**. Follow the value to its producer; when the build runs NullAway (an Error Prone plugin) or the Checker Framework, run it and cite the output.
8. Stream pitfalls: side effects in `map`/`filter`, a `Stream` consumed twice, `Collectors.toMap` without a merge function on colliding keys, `parallel()` on a short or stateful pipeline. **Major** for `toMap` collisions and reuse (runtime exceptions); **Minor** otherwise. Read every terminal operation in the diff.
9. `int` arithmetic on sizes, millis, money or ids that can pass 2^31 (`(int) longValue`, missing `Math.toIntExact`, `Math.abs(Integer.MIN_VALUE)`, `a * b` before widening). **Major** when the value reaches a decision. Compute the range; Error Prone `IntLongMath`/`NarrowingCompoundAssignment` when available; `javac -Xlint:all` and `mvn -q test`/`./gradlew test` must have been run and cited for anything you assert.

### Idioms a reviewer should expect

- `final` fields set in the constructor; records or immutable classes for data carriers; `List.of`/`Map.of` for fixed collections.
- Interfaces (`List`, `Map`) in signatures, concrete types only at construction.
- `Objects.requireNonNull` at constructor boundaries; `Objects.equals` for nullable comparisons.
- `java.time` over `Date`/`Calendar`; `Duration` over raw millis in signatures.
- Enums over int constants; exhaustive `switch` or a `default` that throws.
- Static factories or builders over telescoping constructors.
- Unchecked exceptions for programmer errors, a domain exception for recoverable conditions; follow the tree's choice.

### False positives (java)

- `catch (InterruptedException e)` that calls `Thread.currentThread().interrupt()` and returns is correct handling, not a swallow.
- A collection built in the constructor and never written again is safely published through a `final` field; no lock needed.
- `Optional.get()` immediately after `isPresent()` in the same expression, or inside `ifPresent`/`map` chains.
- A broad `catch (Exception e)` at a top-level boundary (request handler, scheduled job, `main`) that logs and converts to an error response.
- A callee that does not close a stream or pooled `Connection` whose ownership is documented as the caller's.
