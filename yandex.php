<?php

// Send request from backend to avoid CORS error

if (!isset($_FILES['image']))
	exit();

if ($_FILES['image']['size'][0] > 10000000)
	exit();

$tmpfile = $_FILES['image']['tmp_name'][0];
$filename = basename($_FILES['image']['name'][0]);
$cFile = curl_file_create($tmpfile, $_FILES['image']['type'][0], $filename);

$post = array('upfile' => $cFile);
$url = 'https://yandex.com/images/search';
$getdata = '?rpt=imageview&format=json&request={"blocks":[{"block":"b-page_type_search-by-image__link"}]}';
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url . $getdata);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
$result = curl_exec($ch);
curl_close($ch);
$data = json_decode($result);
$query = $data->{'blocks'}[0]->{'params'}->{'url'};
echo $url . '?' . $query;

?>