<?php

// Send request from backend to avoid CORS error

if (!isset($_FILES['image']))
	exit();

if ($_FILES['image']['size'][0] > 10000000)
	exit();

$tmpfile = $_FILES['image']['tmp_name'][0];
$filename = basename($_FILES['image']['name'][0]);
$cFile = curl_file_create($tmpfile, $_FILES['image']['type'][0], $filename);

$post = array('encoded_image' => $cFile);
$url = 'https://lens.google.com/upload';
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
curl_setopt($ch, CURLOPT_HEADERFUNCTION,
    function($curl, $header) use (&$headers)
    {
        $len = strlen($header);
        $header = explode(':', $header, 2);
        if (strtolower(trim($header[0])) == 'location')
            echo trim($header[1]);
        
        return $len;
    }
);
$result = curl_exec($ch);
curl_close($ch);

?>