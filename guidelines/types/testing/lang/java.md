### Java specifics for testing

JUnit 5 gives a fresh instance per test method, Mockito makes it easy to mock the thing under test, and JVM thread and time APIs produce tests that fail only on CI.

### Always check (java)

1. The suite was not run the way the build runs it: `mvn -q -DskipTests=false test` (or `mvn -q verify` when integration tests sit under failsafe) or `./gradlew test`, plus the changed classes alone (`-Dtest=ClassName`, `--tests ClassName`). **Major** on your own output: report commands, counts and failures; a build with `skipTests` or `-x test` defaulted on is not a run.
2. The class under test, or a pure method the diff changed, is a Mockito mock or spy (`@Mock`/`@Spy` on the subject, `when(subject.method())`), so the test exercises stubs. **Major**. For every `@Mock`/`mock(` name the collaborator it replaces; a mock of a value object, an entity or the service being tested is the finding.
3. Persistence tested only against a mocked repository or `EntityManager` when the change edits a query, mapping or transaction boundary. **Major**. Expect Testcontainers, the embedded database the tree already uses, or a `@DataJpaTest`-style slice when Spring is present; `when(repo.findBy...).thenReturn(...)` cannot fail on a wrong JPQL string.
4. Tests write to the working directory, `/tmp` or a literal path instead of `@TempDir`, or mutate static state (static fields, `System.setProperty`, `TimeZone.setDefault`, `Locale.setDefault`) without reset. **Major**. Grep `new File(`, `Paths.get(`, `setProperty(`, `setDefault(` in changed test sources.
5. Timing-based tests: `Thread.sleep`, `CountDownLatch.await()` with no timeout, `Awaitility` with a tight `atMost`, or `Instant.now()`/`LocalDate.now()`/`System.currentTimeMillis()` inside an assertion instead of an injected `Clock`. **Major**. Grep the test sources and run the changed class several times; `surefire.rerunFailingTestsCount` is a symptom, not a fix.
6. Several `@Test` methods differing only in literals where `@ParameterizedTest` with `@CsvSource`/`@MethodSource`/`@EnumSource` would name each case. **Minor**. Three or more copies is the finding.
7. Names that state neither behaviour nor condition (`test1`, `testSave`, `shouldWork`), or `@DisplayName` used to say what the method name does not. **Minor**. Match the tree's style, `method_condition_outcome` or `shouldOutcomeWhenCondition`.
8. JUnit 4 imports (`org.junit.Test`, `@RunWith`, `@Before`) in a JUnit 5 tree so the test never runs, `@Disabled` without a reason, `assertThrows(Exception.class, ...)`, or the `try { ...; fail(); } catch (Exception e) {}` idiom that passes on the wrong exception. **Minor**; **Major** when it is the only test of the error path.
9. Trivially passing assertions: `assertNotNull` on a constructor-guaranteed value, `verify(mock)` as the sole assertion, `assertEquals(x, x)`, or assertions inside a lambda or thread that is never joined. **Major**. Read each test to its last line.

### Idioms a reviewer should expect

- JUnit 5 throughout: `org.junit.jupiter.api.Test`, `@BeforeEach`/`@AfterEach`, `@Nested` for grouped scenarios, `@TestInstance(PER_CLASS)` only when sharing is intended.
- One assertion library consistently (AssertJ `assertThat(...)` or JUnit `assertEquals(expected, actual)` in that argument order).
- `@ExtendWith(MockitoExtension.class)` with strict stubs so unused stubbing fails; `ArgumentCaptor` on the record or message written rather than `verify(times(1))` everywhere.
- Testcontainers via `@Testcontainers` and a `static @Container` shared per class or module; `@Tag("integration")` to separate slow tests.
- `Clock` injected in production code and `Clock.fixed(...)` in tests.
- Fixtures from builders or static factories in a test `support` package, not copied literals.

### False positives (java)

- Mockito mocks of genuine collaborators (HTTP clients, message producers, clocks, and repositories when the change is in service logic, not in the query).
- `@InjectMocks` on the class under test with `@Mock` collaborators is the normal pattern; only a mock of the subject itself is the finding.
- `Thread.sleep` inside a test of retry or backoff logic that injects a fake sleeper, or a latch `await` with a generous timeout whose boolean result is asserted.
- A lone `assertThrows(SpecificException.class, ...)` is a complete test of the error branch.
- An integration test tagged out of the default `test` task but run under `verify` or a dedicated task is not skipped without reason.
