<?php

declare(strict_types=1);

require_once __DIR__ . '/init.php';

use DataSuite\Auth;

Auth::startSession();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = trim((string) ($_POST['password'] ?? ''));
    if ($password !== '' && Auth::login($password)) {
        header('Location: /');
        exit;
    }
    $error = 'Invalid password.';
}

?><!DOCTYPE html>
<html lang="en" class="exo-theme">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — DataSuite</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body class="login-page">
  <div class="site-bg" aria-hidden="true"></div>
  <main class="login-card">
    <div class="brand-lockup brand-lockup--center">
      <img src="/assets/logo.png" alt="" class="brand-mark brand-mark--lg" width="48" height="48">
      <div class="brand-text">
        <span class="brand-wordmark">Exosites</span>
        <span class="brand-product">DataSuite</span>
      </div>
    </div>
    <p class="login-tagline">Internal product overview</p>
    <?php if (!empty($error)): ?>
      <p class="error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p>
    <?php endif; ?>
    <form method="post" action="/login.php">
      <label for="password">Team password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit" class="btn-primary">Sign in</button>
    </form>
    <p class="login-footer muted">
      <a href="https://exosites.ch" target="_blank" rel="noopener noreferrer">exosites.ch</a>
    </p>
  </main>
</body>
</html>
