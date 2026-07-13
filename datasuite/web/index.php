<?php

declare(strict_types=1);

require_once __DIR__ . '/init.php';

use DataSuite\Auth;

Auth::startSession();
if (!Auth::isAuthenticated()) {
    header('Location: /login.php');
    exit;
}

?><!DOCTYPE html>
<html lang="en" class="exo-theme">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DataSuite — Exosites</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <div class="site-bg" aria-hidden="true"></div>
  <header class="topbar">
    <div class="brand-lockup">
      <img src="/assets/logo.png" alt="" class="brand-mark" width="36" height="36">
      <div class="brand-text">
        <span class="brand-wordmark">Exosites</span>
        <span class="brand-product">DataSuite · Product overview</span>
      </div>
    </div>
    <nav class="tabs" role="tablist" aria-label="Dashboard sections">
      <button type="button" class="tab active" data-panel="product">Product</button>
      <button type="button" class="tab" data-panel="overview">Overview</button>
      <button type="button" class="tab" data-panel="activity">Activity</button>
      <button type="button" class="tab" data-panel="funnel">Funnel</button>
      <button type="button" class="tab" data-panel="quality">Quality</button>
      <button type="button" class="tab" data-panel="feedback">Feedback</button>
      <button type="button" class="tab" data-panel="trends">Trends</button>
    </nav>
    <div class="toolbar">
      <div class="period-toggle" role="group" aria-label="Time range">
        <button type="button" class="period-btn" data-days="7">7d</button>
        <button type="button" class="period-btn active" data-days="30">30d</button>
        <button type="button" class="period-btn" data-days="90">90d</button>
      </div>
      <button type="button" class="refresh-btn" id="refresh-btn" title="Refresh data">Refresh</button>
      <span class="updated-at muted" id="updated-at" aria-live="polite"></span>
      <a class="logout" href="/logout.php">Sign out</a>
    </div>
  </header>

  <main id="app">
    <section id="panel-product" class="panel active" aria-live="polite"></section>
    <section id="panel-overview" class="panel" hidden aria-live="polite"></section>
    <section id="panel-activity" class="panel" hidden aria-live="polite"></section>
    <section id="panel-funnel" class="panel" hidden aria-live="polite"></section>
    <section id="panel-quality" class="panel" hidden aria-live="polite"></section>
    <section id="panel-feedback" class="panel" hidden aria-live="polite"></section>
    <section id="panel-trends" class="panel" hidden aria-live="polite"></section>
  </main>

  <footer class="site-footer">
    <a href="https://exosites.ch" target="_blank" rel="noopener noreferrer">exosites.ch</a>
    <span class="muted">Internal analytics</span>
  </footer>

  <script type="module" src="/assets/app.js"></script>
</body>
</html>
