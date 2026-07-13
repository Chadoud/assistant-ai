<?php

declare(strict_types=1);

require_once __DIR__ . '/init.php';

use DataSuite\Auth;

Auth::logout();
header('Location: /login.php');
exit;
