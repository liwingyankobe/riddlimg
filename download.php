<?php

session_start();

if (!isset($_POST['url'])) {
    http_response_code(400);
    exit();
}

$url = $_POST['url'];

// We no longer need to modify the session.
// Release the session lock before making a request back to our website.
session_write_close();

$parsed = parse_url($url);

if (
    !isset($parsed['scheme'], $parsed['host']) ||
    !in_array(strtolower($parsed['scheme']), ['http', 'https'], true)
) {
    http_response_code(400);
    exit('Invalid URL');
}

$host = strtolower($parsed['host']);

$isOwnWebsite =
    $host === 'thestringharmony.com' ||
    $host === 'www.thestringharmony.com';

$ch = curl_init();

$options = [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
];

if ($isOwnWebsite) {
    $options[CURLOPT_COOKIE] =
        session_name() . '=' . session_id();
}

curl_setopt_array($ch, $options);

$result = curl_exec($ch);

if ($result === false) {
    http_response_code(502);
    curl_close($ch);
    exit('Failed to fetch URL');
}

$statusCode  = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

curl_close($ch);

if ($statusCode != 200) {
    http_response_code($statusCode);
    exit();
}

if ($contentType) {
    header('Content-Type: ' . $contentType);
}

echo $result;
exit();

?>