<?php

//require __DIR__ . '/vendor/autoload.php';

if (!isset($_FILES['image']))
	exit();

if ($_FILES['image']['size'][0] > 10000000)
	exit();

$exiftoolPath = trim(shell_exec('which exiftool'));

// exit program if exiftool binary not in system path
if (empty($exiftoolPath)) {
	exit();
}

$tempFile = $_FILES['image']['tmp_name'][0];
$command = sprintf('%s -G1 -b -L -json %s', escapeshellarg($exiftoolPath), escapeshellarg($tempFile));

$output = shell_exec($command);
$data = json_decode($output, true);

// exit program if exiftool does not return valid json
if (!$data || !isset($data[0]))
	exit();

$result = array();
$ignoredGroups = ['ExifTool', 'System'];

foreach ($data[0] as $key => $value) {
	$parts = explode(':', $key, 2);
	if (count($parts) < 2) continue;

	$group = $parts[0];
	$name = $parts[1];

	if (in_array($group, $ignoredGroups))
		continue;

	if (!isset($result[$group]))
		$result[$group] = array();

	// makes sure any array value from exiftool is turned into a string
	if (is_array($value)) {
		$value = implode(', ', $value);
	}

	if ($name == 'ThumbnailImage')
		$result[$group][$name] = @utf8_encode(base64_decode(str_replace('base64:', '', $value)));
	else
		$result[$group][$name] = mb_convert_encoding((string)$value, 'UTF-8');
}

header('Content-type: application/json');
echo json_encode($result);

?>
