"""Unit tests for build/install error classification."""

from __future__ import annotations

from codegen.error_taxonomy import (
    ErrorClass,
    classify_error,
    package_name_from_specifier,
)


class TestPackageNameFromSpecifier:
    def test_bare_package(self):
        assert package_name_from_specifier("uuid") == "uuid"

    def test_subpath_maps_to_package(self):
        assert package_name_from_specifier("uuid/v4") == "uuid"
        assert package_name_from_specifier("react-dom/client") == "react-dom"

    def test_scoped_package_with_subpath(self):
        assert package_name_from_specifier("@tanstack/react-query") == "@tanstack/react-query"
        assert package_name_from_specifier("@scope/pkg/deep/path") == "@scope/pkg"

    def test_relative_and_absolute_are_not_packages(self):
        assert package_name_from_specifier("./App") is None
        assert package_name_from_specifier("../lib/utils") is None
        assert package_name_from_specifier("/abs/path") is None

    def test_node_builtins_excluded(self):
        assert package_name_from_specifier("fs") is None
        assert package_name_from_specifier("node:path") is None

    def test_virtual_and_url_specifiers_excluded(self):
        assert package_name_from_specifier("virtual:pwa-register") is None
        assert package_name_from_specifier("https://esm.sh/uuid") is None


class TestClassifyError:
    def test_vite_optimize_deps_missing_package(self):
        text = (
            "Failed to resolve dependency: uuid, present in 'optimizeDeps.include'\n"
            "The following dependencies are imported but could not be resolved:\n"
            "  uuid (imported by /Users/x/.ai-manager/studio/s1/src/App.tsx)\n"
            "Are they installed?"
        )
        diagnosis = classify_error(text)
        assert diagnosis.error_class is ErrorClass.missing_npm_package
        assert "uuid" in diagnosis.packages

    def test_failed_to_resolve_bare_import(self):
        diagnosis = classify_error('Failed to resolve import "zustand" from "src/store.ts". Does the file exist?')
        assert diagnosis.error_class is ErrorClass.missing_npm_package
        assert diagnosis.packages == ("zustand",)

    def test_failed_to_resolve_relative_import_is_missing_file(self):
        diagnosis = classify_error('Failed to resolve import "./components/Feed" from "src/App.tsx".')
        assert diagnosis.error_class is ErrorClass.missing_local_file
        assert diagnosis.packages == ()

    def test_ansi_codes_are_stripped_before_matching(self):
        diagnosis = classify_error("\x1b[31mFailed to resolve import \"uuid\" from \"src/App.tsx\"\x1b[39m")
        assert diagnosis.error_class is ErrorClass.missing_npm_package
        assert diagnosis.packages == ("uuid",)

    def test_npm_registry_version_error(self):
        diagnosis = classify_error(
            "npm error code ETARGET\nnpm error notarget No matching version found for framer-motion@^99.0.0."
        )
        assert diagnosis.error_class is ErrorClass.install_registry_error
        assert diagnosis.packages == ("framer-motion",)

    def test_port_conflict(self):
        diagnosis = classify_error("Error: listen EADDRINUSE: address already in use 127.0.0.1:5300")
        assert diagnosis.error_class is ErrorClass.port_conflict

    def test_syntax_error(self):
        diagnosis = classify_error("Transform failed with 1 error: Unexpected token (12:5)")
        assert diagnosis.error_class is ErrorClass.syntax_error

    def test_tailwind_error(self):
        diagnosis = classify_error("[postcss] tailwindcss: Cannot apply unknown utility class")
        assert diagnosis.error_class is ErrorClass.css_tailwind

    def test_unknown_error(self):
        diagnosis = classify_error("something exploded in a novel way")
        assert diagnosis.error_class is ErrorClass.unknown
        assert diagnosis.fingerprint

    def test_fingerprint_is_stable_across_volatile_details(self):
        a = classify_error('Failed to resolve import "uuid" from "src/App.tsx"')
        b = classify_error('Failed to resolve import "uuid" from "src/components/Card.tsx"')
        assert a.fingerprint == b.fingerprint

    def test_fingerprint_differs_between_packages(self):
        a = classify_error('Failed to resolve import "uuid" from "src/App.tsx"')
        b = classify_error('Failed to resolve import "zustand" from "src/App.tsx"')
        assert a.fingerprint != b.fingerprint

    def test_empty_input(self):
        diagnosis = classify_error("")
        assert diagnosis.error_class is ErrorClass.unknown
