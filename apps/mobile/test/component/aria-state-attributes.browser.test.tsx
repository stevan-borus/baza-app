/**
 * react-native-web 0.21 drops `accessibilityState` on the floor — it emits
 * `role="checkbox"` / `role="radio"` / `role="tab"` with no state attribute,
 * so a screen reader on web cannot announce whether a control is checked or
 * selected. Every selectable control therefore carries an explicit `aria-*`
 * attribute alongside `accessibilityState` (which native still reads).
 *
 * These mount a representative control per role shape. They assert the DOM
 * attribute, not classes — the class string is styling, the attribute is the
 * thing assistive tech consumes.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { SocialMediaQuestion } from "@/components/consent/social-media-question";
import { ClientDetailTabBar } from "@/components/admin/client-detail-tab-bar";
import { FilterChip } from "@/components/ui/studio/filter-chip";
import { MonthStepper } from "@/components/payroll/month-stepper";
import { ClientPicker } from "@/components/ui/client-picker";
import { FloatingTabBar } from "@/lib/tab-layout-theme";
import { renderWithQueryClient } from "./helpers";

describe("checkbox controls report their checked state to the DOM", () => {
  const clients = [
    { id: "cp-1", user: { id: "u-1", fullName: "Ana Anić" } },
    { id: "cp-2", user: { id: "u-2", fullName: "Boris Borić" } },
  ];

  it("marks a multi-select client row aria-checked", () => {
    const screen = renderWithQueryClient(
      <ClientPicker
        mode="scoped"
        clients={clients}
        optionTestIDPrefix="aria-client"
        selectedIds={new Set(["cp-1"])}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByTestId("aria-client-cp-1")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("aria-client-cp-2")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("uses aria-pressed, not aria-checked, in single-select mode", () => {
    const screen = renderWithQueryClient(
      <ClientPicker
        mode="scoped"
        clients={clients}
        optionTestIDPrefix="aria-single"
        selectedId="cp-1"
        onSelect={() => {}}
      />,
    );

    const row = screen.getByTestId("aria-single-cp-1");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).not.toHaveAttribute("aria-checked");
  });
});

describe("radio controls report their selection to the DOM", () => {
  it("marks the chosen social-media answer aria-checked", () => {
    const screen = render(
      <SocialMediaQuestion value="yes" onChange={() => {}} />,
    );

    expect(screen.getByTestId("social-media-yes")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("social-media-no")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("marks a disabled radio aria-disabled", () => {
    const screen = render(
      <SocialMediaQuestion value="yes" onChange={() => {}} disabled />,
    );

    expect(screen.getByTestId("social-media-yes")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("tabs report their selection with aria-selected", () => {
  it("marks only the active tab aria-selected", () => {
    const screen = render(
      <ClientDetailTabBar active="paketi" onChange={() => {}} />,
    );

    expect(screen.getByTestId("client-detail-tab-paketi")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("client-detail-tab-pregled")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("uses aria-selected, not aria-checked — a tab is not a checkbox", () => {
    const screen = render(
      <ClientDetailTabBar active="pregled" onChange={() => {}} />,
    );

    expect(screen.getByTestId("client-detail-tab-pregled")).not.toHaveAttribute(
      "aria-checked",
    );
  });
});

describe("toggle buttons report their pressed state", () => {
  it("marks an active filter chip aria-pressed", () => {
    const screen = render(
      <FilterChip
        label="Aktivni"
        active
        onPress={() => {}}
        testID="filter-chip-active"
      />,
    );

    expect(screen.getByTestId("filter-chip-active")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("marks an idle filter chip aria-pressed false", () => {
    const screen = render(
      <FilterChip
        label="Aktivni"
        active={false}
        onPress={() => {}}
        testID="filter-chip-idle"
      />,
    );

    expect(screen.getByTestId("filter-chip-idle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("disabled controls report aria-disabled", () => {
  it("marks the blocked next-month step aria-disabled", () => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
    try {
      const screen = render(
        <MonthStepper cursor={{ year: 2026, month: 8 }} onChange={() => {}} />,
      );

      expect(
        screen.getByTestId("payroll-month-stepper-next"),
      ).toHaveAttribute("aria-disabled", "true");
    } finally {
      delete process.env.TEST_ANCHOR_TIME;
    }
  });
});

describe("the bottom tab bar exposes real tab semantics", () => {
  /**
   * FloatingTabBar takes react-navigation's TabBarProps. Building a minimal
   * real state/descriptors pair mounts the shipped component rather than a
   * stand-in, so the role and the state attribute are asserted on the actual
   * navigation control users tab through.
   */
  function renderTabBar(focusedIndex: number) {
    const routes = [
      { key: "pregled-1", name: "pregled", params: undefined },
      { key: "klijenti-1", name: "klijenti", params: undefined },
    ];
    const descriptors = Object.fromEntries(
      routes.map((r) => [r.key, { options: { title: r.name } }]),
    );

    return render(
      <FloatingTabBar
        isDark={false}
        state={{ routes, index: focusedIndex } as never}
        descriptors={descriptors as never}
        navigation={{ emit: () => ({ defaultPrevented: false }), navigate: () => {} } as never}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 } as never}
      />,
    );
  }

  it("renders each tab with role=tab inside a tablist", () => {
    const screen = renderTabBar(0);

    expect(screen.getByTestId("tab-pregled")).toHaveAttribute("role", "tab");
    expect(screen.getByTestId("tab-klijenti")).toHaveAttribute("role", "tab");
    expect(
      screen.getByTestId("tab-pregled").closest('[role="tablist"]'),
    ).not.toBeNull();
  });

  it("marks the focused tab aria-selected and the others false", () => {
    const screen = renderTabBar(0);

    expect(screen.getByTestId("tab-pregled")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("tab-klijenti")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("moves aria-selected when a different tab is focused", () => {
    const screen = renderTabBar(1);

    expect(screen.getByTestId("tab-klijenti")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("tab-pregled")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});
