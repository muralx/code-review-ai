### Java specifics for code-structure

A Java package is a weak boundary (anything `public` is visible to the whole classpath; package-private is the only enforcement short of JPMS) and the build module is the strong one, so judge by what a newcomer can reach and what another module can import.

### Always check (java)

1. A layer-named package (`controllers`, `services`, `repositories`, `dtos`) added to a package-by-feature tree, a feature package added to a layer tree, or one feature spread across both styles. **Minor**; **Major** when it makes a domain package depend on a web or persistence package. Read the top two levels of `src/main/java` and cite the convention the tree follows.
2. Types, constructors or methods made `public` that have no caller outside their package, or a `public` implementation beside its `public` interface so callers can bypass it. **Minor**; **Major** in a published library (binary compatibility). Grep each new `public` type for external callers; package-private is the default to expect, and where `module-info.java` exists check `exports` too.
3. A dependency pointing from a lower module to a higher one, or a `domain`/`core` module importing Spring MVC, JPA, Jackson or servlet types. **Major**. Run `mvn -q dependency:tree -pl <module>` or `./gradlew :<module>:dependencies` and read the module's build file; run ArchUnit tests when the tree has them. A `compile`/`implementation` dependency that should be test-scoped is a **Minor** cousin.
4. DI configuration scattered: `@Bean` methods inside feature classes, `@Configuration` placed far from the module it configures, or `@ComponentScan`/`@Import` widened over a package the module does not own. **Minor**; **Major** when the scan pulls another module's beans into the context. Grep `@Configuration`, `@ComponentScan`, `@Import`, `@Enable*` in the diff.
5. An interface with one implementation, no test double and no module boundary to cross (`FooService` plus `FooServiceImpl`). **Minor**. Grep `implements X` for each new interface; one hit in the same package is the finding, one in another module or a test fake is not.
6. A class past the tree's norm or carrying unrelated responsibilities: a `*Service`/`*Manager`/`*Util` with constructor arity well above the tree's (six or more against an average of three), methods over about 60 lines, or a utility class of unrelated statics. **Minor**; **Major** when its branches cannot be tested separately. Cite `wc -l`, arity, and Checkstyle/PMD output (`mvn -q checkstyle:check`, `pmd:check`) when configured.
7. Build layout drift: a Maven module missing from the parent `<modules>` or lacking `<parent>`, a Gradle subproject absent from `settings.gradle(.kts)`, versions declared in a leaf instead of `dependencyManagement`/the version catalog, or a module cycle (`The projects in the reactor contain a cyclic reference`). **Major** for cycles and unmanaged versions; **Minor** otherwise. Run `mvn -q validate` or `./gradlew projects`.
8. The same concept defined twice across modules (two `UserDto`, two `Money`), or a constant or enum redefined instead of imported. **Minor**; **Major** when the copies encode a rule that can drift (status set, validation). Grep the simple class name across modules and cite both.
9. Production code under `src/test`, test code under `src/main`, or fixtures one module needs placed in a shared `test-support` module (or the reverse). **Minor**. Read the source set of each new file.

### Idioms a reviewer should expect

- One top-level `public` class per file, named after it; lowercase reverse-domain packages without underscores.
- Package-by-feature (`order`, `payment`, `user`) with package-private implementations and a small `public` API, or the tree's layer layout followed consistently.
- Constructor injection into `final` fields, no field injection in new code; one `@Configuration` per module or feature.
- Records for immutable carriers; one `@ConfigurationProperties`-style class per config prefix.
- Versions managed in the parent POM, a BOM or the Gradle version catalog; `api`/`impl` or `core`/`adapter` splits only when something outside the repo consumes `api`.
- Interfaces named for the role (`PaymentGateway`), implementations for the mechanism (`RestPaymentGateway`), never `*Impl`.
- Utility classes `final` with a private constructor, used sparingly.

### False positives (java)

- `public` required by a framework through reflection or proxies: JPA entities, Jackson-bound DTOs, Spring beans wired across packages, test methods in JUnit 4 style.
- A single-implementation interface that is a module boundary (`api` consumed by `impl`), a hexagonal port, or a published SPI.
- `*Impl` names or a layer layout the tree already uses everywhere; match the tree.
- A long class that is a generated client, a MapStruct mapper or an enum of constants.
- `@Configuration` classes gathered in a `config` package when that is the tree's convention.
