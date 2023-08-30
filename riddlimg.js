let rawFile;
let hiddenFile;
let originalImageData;
let secondImageData;
let locked = false;
let panelButton = '';
let channel = 0;
let bitPlaneChannel = 0;
let bitPlane = 0;
let grayScale;
let combine = false;
let combineMode = -1;
let exif = false;
let content = null;
let contentType;
let lsbData = '';
let framesData = null;
let frameNo = 0;
let canvas;
let ctx;

window.onload = () => {
	document.getElementById('file').value = '';
	document.getElementById('url').value = '';
	document.getElementById('contentSave').addEventListener('click', function() {saveFile(content, contentType);});
}

function hexToAscii(s) {
	let res = '';
	for (let i = 0; i < s.length; i += 2)
		res += String.fromCharCode(parseInt(s.substr(i, 2), 16));
	return res;
}

function enterURL(event) {
	if (event.key == "Enter") {
		event.preventDefault();
		upload();
  }
}

async function upload(){
	if (document.getElementById('url').value == '' && document.getElementById('file').value == '')
		return;
	let message = document.getElementById('msg');
	let uploadFile;
	message.innerText = 'Loading...';
	if (document.getElementById('url').value != '') {
		if (!document.getElementById('url').checkValidity()) {
			message.innerText = 'Invalid URL!';
			return;
		}
		const response = await fetch('https://corsproxy.io/?' + document.getElementById('url').value);
		if (!response.ok) {
			message.innerText = 'URL not found!';
			return;
		}
		const fileType = response.headers.get('content-type');
		data = await response.blob();
		uploadFile = new File([data], 'source', {type: fileType});
	} else
		uploadFile = document.getElementById('file').files[0];
	if (uploadFile.size > 10000000) {
		message.innerText = 'Too large file size!';
		return;
	}
	let img = new Image();
	img.onload = function() {
		if (combine) {
			if (canvas.width != this.width || canvas.height != this.height) {
				message.innerText = 'Not matching image size!';
				return;
			}
			let fakeCanvas = document.createElement('canvas');
			fakeCanvas.width = this.width;
			fakeCanvas.height = this.height;
			let fakeCtx = fakeCanvas.getContext('2d');
			fakeCtx.drawImage(this, 0, 0);
			secondImageData = fakeCtx.getImageData(0, 0, this.width, this.height);
			message.innerText = 'Uploaded successfully!';
			if (combineMode == -1) combineMode = 0;
			combineImages(0);
		} else {
			canvas = document.getElementById('image');
			canvas.width = this.width;
			canvas.height = this.height;
			ctx = canvas.getContext('2d');
			ctx.drawImage(this, 0, 0);
			rawFile = uploadFile;
			exif = false;
			content = null;
			framesData = null;
			frameNo = 0;
			document.getElementById('imageArea').style.display = 'block';
			document.getElementById('coords').style.display = 'block';
			document.getElementById('operations').style.display = 'block';
			work();
			message.innerText = 'Uploaded successfully!';
		}
	};
	img.onerror = function() {
		message.innerText = 'Invalid image file!';
	}
	img.src = URL.createObjectURL(uploadFile);
}

function updateCoords(event){
	if (locked) return;
	document.getElementById('x').innerText = event.offsetX;
	document.getElementById('y').innerText = event.offsetY;
	const pixel = ctx.getImageData(event.offsetX, event.offsetY, 1, 1).data;
	document.getElementById('r').innerText = pixel[0];
	document.getElementById('g').innerText = pixel[1];
	document.getElementById('b').innerText = pixel[2];
	let colorhex = '';
	for (let i = 0; i < 3; i++){
		hex = pixel[i].toString(16);
		if (hex.length == 1)
			hex = '0' + hex
		colorhex = colorhex + hex
	}
	document.getElementById('rgbColor').innerText = colorhex;
}

function lock(event){
	if (locked){
		locked = false;
		document.getElementById('lock').innerText = '';
		updateCoords(event);
	} else {
		locked = true;
		document.getElementById('lock').innerHTML = '&nbsp;(Locked)';
	}
}

function showPanel(name){
	if (panelButton != name) {
		if (combine && name != 'combinePanel') switchCombine(false);
		if (panelButton != '')
			document.getElementById(panelButton).style.display = 'none';
		panelButton = name;
		document.getElementById(panelButton).style.display = 'block';
		document.getElementById('msg').innerText = 'Upload an image or enter a URL.';
	}
}

function resetImage(){
	if (combine) switchCombine(false);
	if (panelButton != '') {
		document.getElementById(panelButton).style.display = 'none';
		ctx.putImageData(originalImageData, 0, 0);
		panelButton = '';
		document.getElementById('msg').innerText = 'Upload an image or enter a URL.';
	}
}

function work(){
	originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	combineMode = -1;
	lsbData = '';
	grayScale = [];
	resetImage();
}

function inverse(){
	if (panelButton != 'inverse') {
		if (combine) switchCombine(false);
		if (panelButton != '')
			document.getElementById(panelButton).style.display = 'none';
		panelButton = 'inverse';
		document.getElementById('msg').innerText = 'Upload an image or enter a URL.';
		document.getElementById(panelButton).style.display = 'inline';
		let newImageData = structuredClone(originalImageData);
		let pixels = newImageData.data;
		for (let i = 0; i < pixels.length; i++) {
			if (i % 4 != 3)
				pixels[i] = 255 - pixels[i];
		}
		ctx.putImageData(newImageData, 0, 0);
	}
}

function imageSearch(){
	let fakeCanvas = document.createElement('canvas');
	fakeCanvas.width = canvas.width;
	fakeCanvas.height = canvas.height;
	let fakeCtx = fakeCanvas.getContext('2d');
	fakeCtx.putImageData(originalImageData, 0, 0);
	fakeCanvas.toBlob((blob) => {
		let searchFile = new File([blob], "image.png", {type: "image/png"});
		let container = new DataTransfer(); 
		container.items.add(searchFile);
		document.getElementById('fileSearch').files = container.files;
		document.getElementById('imageSearch').submit();
	});
}

function changeChannel(step){
	if (step == 0) showPanel('channelPanel');
	const channelName = ['Red', 'Green', 'Blue'];
	channel = (channel + step + 3) % 3;
	document.getElementById('channel').innerText = channelName[channel];
	let newImageData = structuredClone(originalImageData);
	let pixels = newImageData.data;
	for (let i = 0; i < pixels.length; i++) {
		if (i % 4 != 3 && i % 4 != channel)
			pixels[i] = 0;
	}
	ctx.putImageData(newImageData, 0, 0);
}

function changeBitPlane(channelStep, planeStep){
	if (channelStep == 0 && planeStep == 0) showPanel('bitPlanePanel');
	const channelName = ['Red', 'Green', 'Blue', 'RGB'];
	bitPlaneChannel = (bitPlaneChannel + channelStep + 4) % 4;
	bitPlane = (bitPlane + planeStep + 8) % 8;
	document.getElementById('bitPlaneChannel').innerText = channelName[bitPlaneChannel];
	document.getElementById('bitPlane').innerText = bitPlane.toString();
	let newImageData = structuredClone(originalImageData);
	let pixels = newImageData.data;
	for (let i = 0; i < pixels.length; i += 4) {
		if (bitPlaneChannel == 3) {
			for (let j = 0; j < 3; j++) {
				const bit = (pixels[i+j] >> bitPlane) & 1;
				if (bit == 1)
					pixels[i+j] = 255;
				else
					pixels[i+j] = 0;
			}
		} else {
			const bit = (pixels[i+bitPlaneChannel] >> bitPlane) & 1;
			if (bit == 1) {
				for (let j = 0; j < 3; j++)
					pixels[i+j] = 255;
			} else {
				for (let j = 0; j < 3; j++)
					pixels[i+j] = 0;
			}
		}
	}
	ctx.putImageData(newImageData, 0, 0);
}

function threshold() {
	let pixels;
	showPanel('thresholdPanel');
	if (grayScale.length == 0) {
		pixels = originalImageData.data;
		for (let i = 0; i < pixels.length; i += 4)
			grayScale.push(Math.floor(0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2]));
	}
	thresholdValue = parseInt(document.getElementById('thresholdSlider').value);
	let newImageData = structuredClone(originalImageData);
	pixels = newImageData.data;
	for (let i = 0; i < grayScale.length; i++) {
		if (grayScale[i] >= thresholdValue) {
			for (let j = 0; j < 3; j++)
				pixels[4 * i + j] = 255;
		} else {
			for (let j = 0; j < 3; j++)
				pixels[4 * i + j] = 0;
		}
	}
	ctx.putImageData(newImageData, 0, 0);
	document.getElementById('thresholdValue').innerText = thresholdValue.toString();
}

function brightness() {
	showPanel('brightnessPanel');
	brightnessValue = parseInt(document.getElementById('brightnessSlider').value);
	gamma = Math.pow(10, -brightnessValue / 100);
	let newImageData = structuredClone(originalImageData);
	let pixels = newImageData.data;
	for (let i = 0; i < pixels.length; i++) {
		if (i % 4 != 3)
			pixels[i] = Math.round(255 * Math.pow(pixels[i] / 255, gamma));
	}
	ctx.putImageData(newImageData, 0, 0);
	document.getElementById('brightnessValue').innerText = brightnessValue.toString();
}

function switchCombine(turn) {
	if (turn) {
		if (combineMode == -1) resetImage();
		else combineImages(0);
		combine = true;
		document.getElementById('msg').innerText = 'Use the above to upload the second image.';
	} else {
		combine = false;
		document.getElementById('msg').innerText = 'Upload an image or enter a URL.';
	}
}

function combineImages(step) {
	if (step == 0) showPanel('combinePanel');
	const modeName = ['XOR', 'OR', 'AND', 'ADD', 'MIN', 'MAX'];
	combineMode = (combineMode + step + 6) % 6;
	document.getElementById('combineMode').innerText = modeName[combineMode];
	let newImageData = structuredClone(originalImageData);
	let pixels1 = newImageData.data;
	let pixels2 = secondImageData.data;
	for (let i = 0; i < pixels1.length; i++){
		if (i % 4 == 3) continue;
		let value;
		switch (combineMode) {
			case 0:
				value = pixels1[i] ^ pixels2[i];
				break;
			case 1:
				value = pixels1[i] | pixels2[i];
				break;
			case 2:
				value = pixels1[i] & pixels2[i];
				break;
			case 3:
				value = pixels1[i] + pixels2[i];
				if (value > 255) value = 255;
				break;
			case 4:
				value = Math.min(pixels1[i], pixels2[i]);
				break;
			case 5:
				value = Math.max(pixels1[i], pixels2[i]);
				break;
		}
		pixels1[i] = value;
	}
	ctx.putImageData(newImageData, 0, 0);
}

function hiddenContent() {
	if (content != null) {
		showPanel('contentPanel');
		return;
	}
	const reader = new FileReader();
	reader.onload = () => {
		const rawData = reader.result;
		if (rawData.substr(0, 8) != hexToAscii('89504e470d0a1a0a') && rawData.substr(0, 2) != hexToAscii('ffd8')) {
			document.getElementById('msg').innerText = 'This function only supports PNG and JPG!';
			return;
		}
		let start;
		if (rawData.substr(0, 8) == hexToAscii('89504e470d0a1a0a')) 
			start = rawData.indexOf(hexToAscii('0000000049454e44ae426082')) + 12;
		else {
			start = 0;
			while (rawData[start + 1] != hexToAscii('d9')) {
				let marker = rawData.charCodeAt(start + 1).toString(16);
				if (marker == '0' || marker == '1' || marker == 'ff' || (marker.length == 2 && marker[0] == 'd'))
					start += 1;
				else
					start += rawData.charCodeAt(start + 2) * 256 + rawData.charCodeAt(start + 3) + 2;
				start = rawData.indexOf(hexToAscii('ff'), start);
			}
			start += 2;
		}
		content = rawData.substr(start);
		document.getElementById('content').innerText = content;
		if (content.substr(0, 3) == 'BZh')
			contentType = 'bz2';
		else if (content.substr(0, 6) == 'GIF87a' || content.substr(0, 6) == 'GIF89a')
			contentType = 'gif';
		else if (content.substr(0, 4) == hexToAscii('49492a00') || content.substr(0, 4) == hexToAscii('4d4d002a'))
			contentType = 'tiff';
		else if (content.substr(0, 2) == hexToAscii('ffd8'))
			contentType = 'jpg';
		else if (content.substr(0, 4) == hexToAscii('504b0304') || content.substr(0, 4) == hexToAscii('504b0506') || content.substr(0, 4) == hexToAscii('504b0708'))
			contentType = 'zip';
		else if (content.substr(0, 6) == hexToAscii('526172211a07'))
			contentType = 'rar';
		else if (content.substr(0, 4) == 'RIFF' && content.substr(8, 4) == 'WAVE')
			contentType = 'wav';
		else if (content.substr(0, 3) == 'ID3')
			contentType = 'mp3';
		else if (content.substr(0, 2) == 'BM')
			contentType = 'bmp';
		else if (content.substr(0, 4) == 'MThd')
			contentType = 'mid';
		else if (content.substr(0, 6) == hexToAscii('377abcaf271c'))
			contentType = '7z';
		else if (content.substr(0, 8) == 'ftypisom')
			contentType = 'mp4';
		else
			contentType = 'txt';
		let typeText = document.getElementById('contentType');
		if (contentType == 'txt') {
			typeText.innerText = 'Content';
			typeText.classList.remove('data');
		} else {
			typeText.innerText = contentType.toUpperCase();
			typeText.classList.add('data');
		}
		showPanel('contentPanel');
	};
	reader.readAsBinaryString(rawFile);
}

function saveFile(fileContent, fileExtension) {
	let fileArray = new Uint8Array(fileContent.length);
	for (let i = 0; i < fileContent.length; i++)
		fileArray[i] = fileContent.charCodeAt(i);
	const blob = new Blob([fileArray]);
	const save = document.getElementById('fileSave');
	save.href = URL.createObjectURL(blob);
	save.download = 'hidden.' + fileExtension;
	save.click();
}

function fullExif(){
	if (document.getElementById('fullExif').innerText == 'View full EXIF') {
		document.getElementById('exifTable').style.display = 'block';
		document.getElementById('fullExif').innerText = 'Hide full EXIF';
	} else {
		document.getElementById('exifTable').style.display = 'none';
		document.getElementById('fullExif').innerText = 'View full EXIF';
	}
}

function viewExif() {
	if (exif) {
		showPanel('exifPanel');
		return;
	}
	document.getElementById('msg').innerText = 'Loading...';
	let formData = new FormData();
	formData.append('image[]', rawFile);
	fetch('exif.php', {
		method: 'POST',
		body: formData
	})
	.then((response) => response.json())
	.then((data) => {
		const selection = ['FileType', 'ImageWidth', 'ImageHeight', 'ImageDescription', 'ModifyDate',
			'Artist', 'Copyright', 'DateTimeOriginal', 'CreateDate', 'UserComment', 'OwnerName',
			'GPSLatitudeRef', 'GPSLatitude', 'GPSLongitudeRef', 'GPSLongitude', 'ObjectName',
			'Keywords', 'Headline', 'Caption-Abstract', 'Location', 'Creator', 'Description',
			'Title', 'Label', 'Rating', 'GPSPosition', 'ThumbnailImage'];
		const exifData = Object.entries(data);
		let potentialTable = document.getElementById('potentialTable');
		let fullTable = document.getElementById('exifTable');
		potentialTable.innerHTML = '';
		fullTable.innerHTML = '';
		let row = potentialTable.insertRow(-1);
		let header = document.createElement('th');
		header.colSpan = 2;
		header.innerText = 'Potentially useful data';
		row.appendChild(header);
		exifData.forEach((group) => {
			row = fullTable.insertRow(-1);
			let header = document.createElement('th');
			header.colSpan = 2;
			header.innerText = group[0];
			row.appendChild(header);
			Object.entries(group[1]).forEach((entry) => {
				row = fullTable.insertRow(-1);
				tag = row.insertCell(0);
				tag.innerText = entry[0];
				tag.classList.add('exifItem');
				value = row.insertCell(1);
				if (entry[0] == 'ThumbnailImage') {
					let imageArray = new Uint8Array(entry[1].length);
					for (let i = 0; i < entry[1].length; i++)
						imageArray[i] = entry[1].charCodeAt(i);
					const blob = new Blob([imageArray]);
					let img = document.createElement('img');
					img.src = URL.createObjectURL(blob);
					value.appendChild(img);
				}
				else if (/^[\u0000-\u007f]*$/.test(entry[1]))
					value.innerText = entry[1];
				else {
					const blob = new Blob([entry[1]], {type: 'text/plain'});
					let a = document.createElement('a');
					a.target = '_blank';
					a.href = URL.createObjectURL(blob);
					a.innerText = 'See here';
					value.appendChild(a);
				}
				value.classList.add('exifData');
				if (selection.includes(entry[0]))
					potentialTable.insertRow(-1).innerHTML = row.innerHTML;
			});
		});
		exif = true;
		showPanel('exifPanel');
	});
}

function initFrame() {
	if (rawFile.type != 'image/gif') {
		document.getElementById('msg').innerText = 'This function only supports GIF!';
		return;
	}
	if (framesData == null) {
		document.getElementById('msg').innerText = 'Loading...';
		let img = document.getElementById('gifImage');
		img.src = URL.createObjectURL(rawFile);
		framesData = new SuperGif({gif: img});
		framesData.load(function() {
			viewFrame(0);
			framesData.pause();
			showPanel('framePanel');
		});
	} else {
		viewFrame(0);
		showPanel('framePanel');
	}
}

function viewFrame(step) {
	const gifLength = framesData.get_length();
	frameNo = (frameNo + step + gifLength) % gifLength;
	framesData.move_to(frameNo);
	let fakeCanvas = framesData.get_canvas();
	let fakeCtx = fakeCanvas.getContext('2d');
	const frameImageData = fakeCtx.getImageData(0, 0, fakeCanvas.width, fakeCanvas.height);
	ctx.putImageData(frameImageData, 0, 0);
	const frameNoDisplay = frameNo + 1;
	document.getElementById('frameNo').innerText = frameNoDisplay.toString();
}

function initLSB() {
	showPanel('lsbPanel');
	document.getElementById('lsbPreview').innerText = lsbData;
}

function extractLSB() {
	lsbData = '';
	const rgbMap = {'r': 0, 'g': 1, 'b': 2};
	let checked = [];
	for (let i = 0; i < 3; i++) {
		const color = document.getElementById('bitPlaneOrder').value[i];
		let colorChecked = [];
		for (let j = 0; j < 8; j++) {
			let digit;
			if (document.getElementById('bitOrder').value == 'lsb')
				digit = j;
			else
				digit = 7 - j;
			if (document.getElementById(color + digit.toString()).checked)
				colorChecked.push(digit);
		}
		checked.push([rgbMap[color], colorChecked]);
	}
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels = imageData.data;
	let binary = 0;
	let count = 7;
	let start = 0;
	for (let i = 0; i < pixels.length / 4; i++) {
		for (let j = 0; j < 3; j++){
			const bits = pixels[start + checked[j][0]];
			for (let k = 0; k < checked[j][1].length; k++) {
				binary += ((bits >> checked[j][1][k]) & 1) << count;
				count -= 1;
				if (count < 0) {
					lsbData += String.fromCharCode(binary);
					binary = 0;
					count = 7;
				}
			}
		}
		if (document.getElementById('pixelOrder').value == 'row')
			start += 4;
		else {
			start = start + 4 * canvas.width;
			if (start >= pixels.length)
				start = start - pixels.length + 4;
		}
	}
	document.getElementById('lsbPreview').innerText = lsbData;
}