<?php

require __DIR__ . '/vendor/autoload.php';

use Monolog\Logger;
use PHPExiftool\Reader;
use PHPExiftool\Driver\Value\ValueInterface;

if (!isset($_FILES['image']))
	exit();

$logger = new Logger('exiftool');
$reader = Reader::create($logger);
$metadataBag = $reader->files($_FILES['image']['tmp_name'][0])->first();
$result = array();
$prev = '';
foreach ($metadataBag as $metadata) {
    $tag = $metadata->getTag();
	$value = $metadata->getValue();
	$group = $tag->getGroupName();
	$name = $tag->getName();
	if ($group == 'ExifTool' || $group == 'System')
		continue;
	if ($group != $prev)
		$result[$group] = array();
	$result[$group][$name] = utf8_encode($value->asString());
	$prev = $group;
}

header('Content-type: application/json');
echo json_encode($result);

?>