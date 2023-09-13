<?php

// Send request from backend to avoid CORS error

if (!isset($_POST['url']))
	exit();

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $_POST['url']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = curl_exec($ch);
if (curl_getinfo($ch, CURLINFO_RESPONSE_CODE) != 200)
	http_response_code(404);
else {
	header('Content-Type: ' . curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
	echo $result;
}
curl_close($ch);

?>