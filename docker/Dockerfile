# code-review-ai reviewer image: Claude Code + agent-link plugin + Go/Python/Node/Java toolchains.
# The framework lives at /opt/code-review-ai; a deployment is bind-mounted at /deployment.
FROM debian:bookworm-slim

ARG NODE_MAJOR=24
ARG GO_VERSION=1.25.3
ARG GRADLE_VERSION=8.14.3
ARG AGENT_LINK_REF=main

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 CI=true

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git jq tmux iptables gosu bash tar xz-utils unzip procps \
      openssh-client python3 python3-venv python3-pip pipx openjdk-17-jdk-headless maven \
    && install -d -m 0755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends gh nodejs \
    && corepack enable && corepack prepare pnpm@10.33.0 --activate \
    && rm -rf /var/lib/apt/lists/*

# Go
RUN ARCH="$(dpkg --print-architecture)" \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" | tar -C /usr/local -xz
ENV PATH=/usr/local/go/bin:$PATH GOFLAGS=-mod=mod GOTOOLCHAIN=local

# Gradle
RUN curl -fsSL "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -o /tmp/gradle.zip \
    && unzip -q /tmp/gradle.zip -d /opt && ln -s /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/local/bin/gradle && rm /tmp/gradle.zip

# uv (Python project tooling)
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

RUN useradd -m -u 1000 -s /bin/bash reviewer

# Framework
COPY --chown=reviewer:reviewer . /opt/code-review-ai
RUN cd /opt/code-review-ai && pnpm install --prod --frozen-lockfile \
    && for b in cra compose-prompt resolve-run discover post-review; do ln -sf /opt/code-review-ai/bin/$b /usr/local/bin/$b; done \
    && ln -sf /opt/code-review-ai/scripts/prep-target.sh /usr/local/bin/prep-target \
    && chmod +x /opt/code-review-ai/scripts/*.sh

# agent-link (edge + plugin). The hub stays on the host.
RUN git clone --depth 1 --branch ${AGENT_LINK_REF} https://github.com/muralx/agent-link.git /opt/agent-link 2>/dev/null \
    || echo "agent-link clone skipped (set AGENT_LINK_REF or mount /opt/agent-link)"; \
    if [ -f /opt/agent-link/package.json ]; then cd /opt/agent-link && pnpm install --frozen-lockfile && chown -R reviewer:reviewer /opt/agent-link; fi

USER reviewer
WORKDIR /home/reviewer
# Claude Code native install → ~/.local/bin/claude (self-updates stay in the home volume)
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && if [ -f /opt/agent-link/package.json ]; then cd /opt/agent-link && pnpm link:bins; fi
ENV PATH=/home/reviewer/.local/bin:$PATH \
    AGENT_LINK_HUB=http://host.docker.internal:8790 \
    CRA_FRAMEWORK=/opt/code-review-ai

USER root
WORKDIR /deployment
ENTRYPOINT ["/opt/code-review-ai/scripts/entrypoint.sh"]
