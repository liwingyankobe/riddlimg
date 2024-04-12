let rawFile;
let hiddenFile;
let imageWidth;
let imageHeight;
const maxCanvasWidth = 800;
const minCanvasWidth = 100;
let originalImageData;
let secondImageData;
let currentImageData;
let scaleFactor = 1.0;
let minScaleFactor = 1.0;
let maxScaleFactor = 20.0;
let dragStart = [];
let mouseCoord = [0, 0];
let locked = false;
let panelButton = '';
const channels = {'r': true, 'g': true, 'b': true, 'a': true};
let bitPlaneChannel = 0;
let bitPlane = 0;
let grayScale;
let colorTable = [];
let hasColorTable = true;
let combine = false;
let combineMode = -1;
let exif = false;
let content = null;
let contentType;
let barcodeData = '';
let lsbData = '';
let framesData = null;
let frameNo = 0;
let canvas;
let ctx;
const instruction = 'Scroll to zoom. Drag to move. Click to lock.';

//initialize page elements when loading
window.onload = () => {
	document.getElementById('file').value = '';
	document.getElementById('url').value = '';
	document.getElementById('contentSave').addEventListener('click', function() {saveFile(content, contentType);});
	canvas = document.getElementById('image');
	ctx = canvas.getContext('2d');
}

function hexToAscii(s) {
	let res = '';
	for (let i = 0; i < s.length; i += 2)
		res += String.fromCharCode(parseInt(s.substr(i, 2), 16));
	return res;
}

//from image coordinate to canvas coordinate
function transformPoint(x, y) {
	const pt = new DOMPoint(x, y).matrixTransform(ctx.getTransform());
	return [Math.floor(pt.x), Math.floor(pt.y)];
}

//from canvas coordinate to image coordinate
function inversePoint(x, y) {
	const pt = new DOMPoint(x, y).matrixTransform(ctx.getTransform().inverse());
	x = Math.floor(pt.x);
	y = Math.floor(pt.y);
	//prevent image coordinates going out of range
	x = x < 0 ? 0 : x >= imageWidth ? imageWidth - 1 : x;
	y = y < 0 ? 0 : y >= imageHeight ? imageHeight - 1 : y;
	return [x, y];
}

//submit URL by pressing Enter
function enterURL(event) {
	if (event.key == "Enter") {
		event.preventDefault();
		upload();
  }
}

//upload new image from file/URL, or the second image for combining two images
async function upload(){
	const url = document.getElementById('url')
	const file = document.getElementById('file')
	
	if (url.value == '' && file.value == '')
		return;
	let message = document.getElementById('msg');
	let uploadFile;
	message.innerText = 'Loading...';

	if (url.value != '') {
		//upload by URL
		if (!url.checkValidity()) {
			message.innerText = 'Invalid URL!';
			return;
		}
		
		if (url.value.startsWith('data:image')) {
			//upload by data URL
			await fetch(url.value)
			.then(res => res.blob())
			.then(blob => {
				uploadFile = new File([blob], 'source', {
					type: url.value.split(';')[0].split(':')[1]
				});
			});
		}
		else {
			//remove source code mode
			if (url.value.startsWith('view-source:'))
				url.value = url.value.slice(12);

			//fetch image using PHP backend to avoid CORS error
			let data = new FormData();
			data.append('url', url.value);
			const response = await fetch('download.php', {
				method: 'POST',
				body: data
			});
			
			if (!response.ok) {
				message.innerText = 'URL not found!';
				return;
			}
			const fileType = response.headers.get('content-type');
			data = await response.blob();
			uploadFile = new File([data], 'source', {type: fileType});
		}
	} else
		//upload from file
		uploadFile = file.files[0];

	//size limit 10MB
	if (uploadFile.size > 10000000) {
		message.innerText = 'Too large file size!';
		return;
	}

	let img = new Image();
	img.onload = function() {
		if (combine) {
			//upload the second image and combine two images
			if (imageWidth != this.width || imageHeight != this.height) {
				message.innerText = 'Not matching image size!';
				return;
			}
			let fakeCanvas = document.createElement('canvas');
			let fakeCtx = fakeCanvas.getContext('2d');
			fakeCanvas.width = imageWidth;
			fakeCanvas.height = imageHeight;
			fakeCtx.drawImage(this, 0, 0);
			secondImageData = fakeCtx.getImageData(0, 0, this.width, this.height);
			message.innerText = instruction;
			if (combineMode == -1) combineMode = 0;
			combineImages(0);
		} else {
			//upload single image for manipulation
			imageWidth = this.width;
			imageHeight = this.height;
			let fakeCanvas = document.createElement('canvas');
			let fakeCtx = fakeCanvas.getContext('2d');
			fakeCanvas.width = imageWidth;
			fakeCanvas.height = imageHeight;
			fakeCtx.drawImage(this, 0, 0);
			currentImageData = fakeCtx.getImageData(0, 0, imageWidth, imageHeight);

			//calclate range of scale factor
			scaleFactor = 1.0;
			if (imageWidth > maxCanvasWidth)
				scaleFactor = maxCanvasWidth / imageWidth;
			else if (imageWidth < minCanvasWidth)
				scaleFactor = minCanvasWidth / imageWidth;
			minScaleFactor = scaleFactor;
			maxScaleFactor = minScaleFactor > 20.0 ? minScaleFactor: 20.0;

			//initialize canvas and panels
			canvas.width = Math.floor(imageWidth * scaleFactor);
			canvas.height = Math.floor(imageHeight * scaleFactor);
			ctx.webkitImageSmoothingEnabled = false;
			ctx.mozImageSmoothingEnabled = false;
			ctx.imageSmoothingEnabled = false;
			ctx.scale(scaleFactor, scaleFactor);
			rawFile = uploadFile;
			exif = false;
			content = null;
			framesData = null;
			frameNo = 0;
			document.getElementById('gifContainer').innerHTML = '<img id="gifImage"/>';
			colorTable = [];
			hasColorTable = true;
			document.getElementById('colorTablePanel').style.display = 'none';
			document.getElementById('imageArea').style.display = 'block';
			document.getElementById('coords').style.display = 'block';
			document.getElementById('operations').style.display = 'block';
			work();
			message.innerText = instruction;
		}
	};
	img.onerror = function() {
		message.innerText = 'Invalid image file!';
	}
	img.src = URL.createObjectURL(uploadFile);
}

//start dragging when mouse down
function canvasDown(event) {
	dragStart = [event.offsetX, event.offsetY];
	canvas.style.cursor = 'grab';
}

//move the image when dragging, or update the coordinates
function canvasMove(event) {
	if (dragStart.length > 0) {
		//move the image
		let shiftX = event.offsetX - mouseCoord[0];
		let shiftY = event.offsetY - mouseCoord[1];
		mouseCoord = [event.offsetX, event.offsetY];
		const topLeft = transformPoint(0, 0);
		const bottomRight = transformPoint(imageWidth, imageHeight);

		//prevent image going out of bound
		if (topLeft[0] + shiftX > 0 || bottomRight[0] + shiftX < canvas.width)
			shiftX = 0;
		if (topLeft[1] + shiftY > 0 || bottomRight[1] + shiftY < canvas.height)
			shiftY = 0;

		ctx.translate(shiftX / scaleFactor, shiftY / scaleFactor);
		draw(currentImageData);
	} else {
		mouseCoord = [event.offsetX, event.offsetY];
		updateCoords();
	}
}

//lock the coordinates when mouse up if not moving
function canvasUp() {
	if (dragStart.length == 0)
		return;
	if (dragStart[0] === mouseCoord[0] && dragStart[1] === mouseCoord[1])
		lockCanvas();
	dragStart = [];
	canvas.style.cursor = 'crosshair';
}

//adjust scale factor and position when scrolling
function zoom(event) {
	event.preventDefault();

	//calculate new scale factor
	const sensitivity = 0.01;
	let newScaleFactor = scaleFactor - event.deltaY * sensitivity;
	if (newScaleFactor < minScaleFactor)
		newScaleFactor = minScaleFactor;
	else if (newScaleFactor > maxScaleFactor)
		newScaleFactor = maxScaleFactor;

	//scale image about cursor location
	const targetPoint = inversePoint(mouseCoord[0], mouseCoord[1]);
	ctx.translate(targetPoint[0], targetPoint[1]);
	ctx.scale(newScaleFactor / scaleFactor, newScaleFactor / scaleFactor);
	ctx.translate(-targetPoint[0], -targetPoint[1]);
	scaleFactor = newScaleFactor;

	//move image to avoid going out of bound
	const topLeft = transformPoint(0, 0);
	const bottomRight = transformPoint(imageWidth, imageHeight);
	let correction = [0, 0];
	if (topLeft[0] > 0)
		correction[0] = -topLeft[0];
	else if (bottomRight[0] < canvas.width)
		correction[0] = canvas.width - bottomRight[0];
	if (topLeft[1] > 0)
		correction[1] = -topLeft[1];
	else if (bottomRight[1] < canvas.height)
		correction[1] = canvas.height - bottomRight[1];
	ctx.translate(correction[0] / scaleFactor, correction[1] / scaleFactor);
	draw(currentImageData);
}

//update coordinates and color values
function updateCoords(){
	if (locked) return;

	//coordinates
	const coord = inversePoint(mouseCoord[0], mouseCoord[1]);
	document.getElementById('x').innerText = coord[0];
	document.getElementById('y').innerText = coord[1];

	updateColors();
}

//update color values
function updateColors(color = []) {
	if (color.length === 0) {
		//read color values from coordinates
		if (document.getElementById('x').innerText.length === 0) return;
		const coord = parseInt(document.getElementById('y').innerText) * imageWidth + 
		parseInt(document.getElementById('x').innerText);
		const pixels = currentImageData.data;
		for (let i = 0; i < 4; i++)
			color.push(pixels[4 * coord + i]);
	}
	const rgba = ['r', 'g', 'b', 'a'];
	for (let i = 0; i < 4; i++)
		document.getElementById(rgba[i]).innerText = color[i].toString();
	let colorhex = '';
	const channelCount = (document.getElementById('alphaContainer').style.display == 'inline') ? 4 : 3;
	for (let i = 0; i < channelCount; i++){
		hex = color[i].toString(16);
		if (hex.length == 1)
			hex = '0' + hex;
		colorhex = colorhex + hex;
	}
	document.getElementById('rgbColor').innerText = colorhex;
}

//switch on/off lock of coordinates and color values
function lockCanvas(){
	if (locked){
		locked = false;
		document.getElementById('lock').innerText = '';
		updateCoords();
	} else {
		locked = true;
		document.getElementById('lock').innerHTML = '&nbsp;(Locked)';
	}
}

//show different panels for different functions
function showPanel(name){
	if (panelButton != name) {
		if (combine && name != 'combinePanel') switchCombine(false);
		if (panelButton != '')
			document.getElementById(panelButton).style.display = 'none';
		panelButton = name;
		document.getElementById(panelButton).style.display = 'block';
		document.getElementById('msg').innerText = instruction;
	}
}

//reset canvas to the original image
function resetImage(){
	if (combine) switchCombine(false);
	if (panelButton != '') {
		document.getElementById(panelButton).style.display = 'none';
		panelButton = '';
		document.getElementById('msg').innerText = instruction;
	}
	currentImageData = structuredClone(originalImageData);
	draw(originalImageData);
}

//use canvas image as the original image
function work(){
	originalImageData = structuredClone(currentImageData);
	if (hasAlphaChannel(originalImageData))
		document.getElementById('alphaContainer').style.display = 'inline';
	else
		document.getElementById('alphaContainer').style.display = 'none';
	combineMode = -1;
	barcodeData = '';
	lsbData = '';
	grayScale = [];
	resetImage();
}

//draw image data according to the translation and scaling
function draw(imageData) {
	const topLeft = transformPoint(0, 0);
	const bottomRight = transformPoint(imageWidth, imageHeight);
	ctx.clearRect(-1, -1, imageWidth + 1, imageHeight + 1);
	let fakeCanvas = document.createElement('canvas');
	let fakeCtx = fakeCanvas.getContext('2d');
	fakeCanvas.width = imageWidth;
	fakeCanvas.height = imageHeight;
	fakeCtx.putImageData(imageData, 0, 0);
	ctx.drawImage(fakeCanvas, 0, 0);
}

//create color table from file or coordinates
function createColorTable() {
	if (colorTable.length === 0) {
		//create color table array
		const reader = new FileReader();
		reader.onload = () => {
			const rawData = reader.result;

			//detect PNG/GIF from file header
			if (rawData.substr(0, 8) != hexToAscii('89504e470d0a1a0a') && 
				rawData.substr(0, 6) != 'GIF87a' && rawData.substr(0, 6) != 'GIF89a') {
				
				hasColorTable = false;
				return;
			}
			
			//search for color table
			let tableIndex;
			let tableLen = 0;
			if (rawData.substr(0, 8) === hexToAscii('89504e470d0a1a0a')) {
				if (rawData.charCodeAt(25) !== 3) {
					hasColorTable = false;
					return;
				}
				const headerIndex = rawData.indexOf('PLTE');
				tableIndex = headerIndex + 4;
				for (let i = headerIndex - 4; i < headerIndex; i++)
					tableLen = 256 * tableLen + rawData.charCodeAt(i);
				tableLen = Math.floor(tableLen / 3);
			} else {
				if (rawData.charCodeAt(10) < 128) {
					hasColorTable = false;
					return;
				}
				tableIndex = 13;
				tableLen = 1 << (rawData.charCodeAt(10) % 8 + 1);
			}

			//save color table and corresponding coordinates
			const colorToIndex = new Map();
			for (let i = 0; i < tableLen; i++) {
				const color = [];
				for (let j = 0; j < 3; j++)
					color.push(rawData.charCodeAt(tableIndex + j));
				colorTable.push([color, [-1, -1]]);
				const colorKey = rawData.substr(tableIndex, 3);
				if (colorToIndex.has(colorKey))
					colorToIndex.get(colorKey).push(i);
				else
					colorToIndex.set(colorKey, [i]);
				tableIndex += 3;
			}
			const pixels = currentImageData.data;
			for (let i = 0; i < pixels.length / 4; i++) {
				let colorKey = '';
				for (let j = 0; j < 3; j++)
					colorKey += String.fromCharCode(pixels[4 * i + j]);
				if (!colorToIndex.has(colorKey))
					continue;
				const indices = colorToIndex.get(colorKey);
				for (let j = 0; j < indices.length; j++)
					colorTable[indices[j]][1] = [i % imageWidth, Math.floor(i / imageWidth)];
				colorToIndex.delete(colorKey);
			}

			drawColorTable();
		}
		reader.readAsBinaryString(rawFile);
	} else {
		//update color table array
		const pixels = currentImageData.data;
		for (let i = 0; i < colorTable.length; i++) {
			if (colorTable[i][1][0] < 0)
				continue;
			const position = colorTable[i][1][1] * imageWidth + colorTable[i][1][0];
			for (let j = 0; j < 3; j++)
				colorTable[i][0][j] = pixels[4 * position + j];
		}
		drawColorTable();
	}
}

//draw color table onto canvas
function drawColorTable() {
	let colorTableCanvas = document.getElementById('colorTable');
	let colorTableCtx = colorTableCanvas.getContext('2d');
	colorTableCtx.webkitImageSmoothingEnabled = false;
	colorTableCtx.mozImageSmoothingEnabled = false;
	colorTableCtx.imageSmoothingEnabled = false;
	const size = Math.floor(colorTableCanvas.width / 16);
	colorTableCtx.clearRect(0, 0, 16 * size, 16 * size);
	for (let i = 0; i < colorTable.length; i++) {
		colorTableCtx.fillStyle = `rgb(
			${colorTable[i][0][0]}
			${colorTable[i][0][1]}
			${colorTable[i][0][2]}
			)`;
		colorTableCtx.fillRect((i % 16) * size, Math.floor(i / 16) * size, size, size);
	}
	document.getElementById('colorTablePanel').style.display = 'block';
}

//switch on/off lock of color values from color table
function lockColorTable(event) {
	if (locked) {
		locked = false;
		document.getElementById('lock').innerText = '';
		colorTableMove(event);
	} else {
		//allow locking for entries with coordinates only
		const size = Math.floor(document.getElementById('colorTable').width / 16);
		const index = Math.floor(event.offsetY / size) * 16 + Math.floor(event.offsetX / size);
		if (index >= colorTable.length || index < 0)
			return;
		if (colorTable[index][1][0] < 0)
			return;
		locked = true;
		document.getElementById('lock').innerHTML = '&nbsp;(Locked)';
	}
}

//update color values from color table
function colorTableMove(event) {
	if (locked) return;
	const size = Math.floor(document.getElementById('colorTable').width / 16);
	const index = Math.floor(event.offsetY / size) * 16 + Math.floor(event.offsetX / size);
	if (index >= colorTable.length || index < 0)
		return;
	if (colorTable[index][1][0] < 0) {
		document.getElementById('x').innerText = '';
		document.getElementById('y').innerText = '';
		updateColors(colorTable[index][0].concat([255]));
	} else {
		document.getElementById('x').innerText = colorTable[index][1][0];
		document.getElementById('y').innerText = colorTable[index][1][1];
		updateColors();
	}
}

//inverse all colors (x -> 255 - x)
function inverse(){
	if (panelButton != 'inverse') {
		//disable other panels
		if (combine) switchCombine(false);
		if (panelButton != '')
			document.getElementById(panelButton).style.display = 'none';
		panelButton = 'inverse';
		document.getElementById('msg').innerText = instruction;
		document.getElementById(panelButton).style.display = 'inline';

		//compute inversed image
		currentImageData = structuredClone(originalImageData);
		let pixels = currentImageData.data;
		for (let i = 0; i < pixels.length; i++) {
			if (i % 4 != 3)
				pixels[i] = 255 - pixels[i];
		}
		draw(currentImageData);
	}
}

//Google Lens image search
function googleLens(){
	let fakeCanvas = document.createElement('canvas');
	fakeCanvas.width = canvas.width;
	fakeCanvas.height = canvas.height;
	let fakeCtx = fakeCanvas.getContext('2d');
	fakeCtx.putImageData(originalImageData, 0, 0);
	fakeCanvas.toBlob((blob) => {
		const searchFile = new File([blob], "image.png", {type: "image/png"});
		let container = new DataTransfer(); 
		container.items.add(searchFile);
		document.getElementById('googleFile').files = container.files;
		document.getElementById('googleSearch').submit();
	});
}

//Yandex image search
function yandex(){
	document.getElementById('msg').innerText = 'Loading...';
	let fakeCanvas = document.createElement('canvas');
	fakeCanvas.width = imageWidth;
	fakeCanvas.height = imageHeight;
	let fakeCtx = fakeCanvas.getContext('2d');
	fakeCtx.putImageData(originalImageData, 0, 0);
	fakeCanvas.toBlob((blob) => {
		const searchFile = new File([blob], "image.jpg", {type: "image/jpeg"});
		let formData = new FormData();
		formData.append('image[]', searchFile);
		fetch('yandex.php', {
			method: 'POST',
			body: formData
		})
		.then((response) => response.text())
		.then((data) => {
			document.getElementById('yandexSearch').href = data;
			document.getElementById('yandexSearch').click();
			document.getElementById('msg').innerText = instruction;
		});
	}, 'image/jpeg');
}

//view RGB(A) channels
function viewChannels(channel){

	//show or hide alpha checkbox
    const wrapper = document.querySelector('#channelPanel .wrapper');
    const alphaCheckbox = document.getElementById('channelA');
    const alphaCheckboxLabel = wrapper.querySelector('label[for="channelA"]');
    if (document.getElementById('alphaContainer').style.display == 'inline') {
        wrapper.style.setProperty("--columns", 4);
        alphaCheckbox.style.display = 'block';
        alphaCheckboxLabel.style.display = 'block';
    } else {
        wrapper.style.setProperty("--columns", 3);
        alphaCheckbox.style.display = 'none';
		alphaCheckbox.checked = false;
		channels['a'] = false;
        alphaCheckboxLabel.style.display = 'none';
    }

	//enable or disable channel if chosen
    if (channel) {
        channels[channel] = document.getElementById('channel' + channel.toUpperCase()).checked;
    } else {
        showPanel('channelPanel');
    }

    currentImageData = structuredClone(originalImageData);
	let pixels = currentImageData.data;

    if (!channels['r'] && !channels['g'] && !channels['b'] && channels['a']) {
		//only alpha is selected - show alpha as grayscale
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i]     = 255;
            pixels[i + 1] = 255;
            pixels[i + 2] = 255;
        }
    } else {
		//show enabled channels without processing
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i]     *= channels['r'] ? 1 : 0;
            pixels[i + 1] *= channels['g'] ? 1 : 0;
            pixels[i + 2] *= channels['b'] ? 1 : 0;
            pixels[i + 3]  = channels['a'] ? pixels[i + 3] : 255;
        }
    }

	draw(currentImageData);
}

//check if there is any non-255 alpha value
function hasAlphaChannel(imageData) {
	let pixels = imageData.data;
	for (let i = 3; i < pixels.length; i += 4) {
		if (pixels[i] !== 255) {
			return true;
		}
	}
	return false;
}

//view RGB(A) bit planes
function changeBitPlane(channelStep, planeStep){
	if (channelStep === 0 && planeStep === 0) showPanel('bitPlanePanel');
    currentImageData = structuredClone(originalImageData);

	//select bit planes
    const channelCount = (document.getElementById('alphaContainer').style.display == 'inline') ? 5 : 4;
    const channelName = ['Red', 'Green', 'Blue', 'RGB'].concat(channelCount === 5 ? ['Alpha'] : []);
    bitPlaneChannel = (bitPlaneChannel + channelStep + channelCount) % channelCount;
    bitPlane = (bitPlane + planeStep + 8) % 8;
	document.getElementById('bitPlaneChannel').innerText = channelName[bitPlaneChannel];
    document.getElementById('bitPlane').innerText = bitPlane.toString();
	
	//compute bit plane image
	let pixels = currentImageData.data;
	for (let i = 0; i < pixels.length; i += 4) {
        let bitValue;
        //single RGB channel bit
        if (bitPlaneChannel < 3) {
            bitValue = (pixels[i + bitPlaneChannel] >> bitPlane) & 1;
        }

        for (let j = 0; j < 3; j++) {
            if (bitPlaneChannel === 3) {
				//all of RGB channel bits
                bitValue = (pixels[i + j] >> bitPlane) & 1;
            } else if (bitPlaneChannel === 4) {
				//alpha channel bit
                bitValue = (pixels[i + 3] >> bitPlane) & 1;
            }
			//output 0 or 255 color values
            pixels[i + j] = bitValue ? 255 : 0;
        }
		if (bitPlaneChannel === 4) {
            pixels[i + 3] = 255;
        }
    }
	draw(currentImageData);
}

//adjust threshold value
function threshold() {
	let pixels;
	showPanel('thresholdPanel');

	//precompute gray scale image
	if (grayScale.length == 0) {
		pixels = originalImageData.data;
		for (let i = 0; i < pixels.length; i += 4)
			grayScale.push(Math.floor(0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2]));
	}

	//compare threshold with gray scale image
	thresholdValue = parseInt(document.getElementById('thresholdSlider').value);
	currentImageData = structuredClone(originalImageData);
	pixels = currentImageData.data;
	for (let i = 0; i < grayScale.length; i++) {
		if (grayScale[i] >= thresholdValue) {
			for (let j = 0; j < 3; j++)
				pixels[4 * i + j] = 255;
		} else {
			for (let j = 0; j < 3; j++)
				pixels[4 * i + j] = 0;
		}
	}
	draw(currentImageData);
	document.getElementById('thresholdValue').innerText = thresholdValue.toString();
}

//adjust brightness using gamma correction
function brightness() {
	showPanel('brightnessPanel');
	const brightnessValue = parseInt(document.getElementById('brightnessSlider').value);
	gamma = Math.pow(10, -brightnessValue / 100);
	currentImageData = structuredClone(originalImageData);
	let pixels = currentImageData.data;
	for (let i = 0; i < pixels.length; i++) {
		if (i % 4 != 3)
			pixels[i] = Math.round(255 * Math.pow(pixels[i] / 255, gamma));
	}
	draw(currentImageData);
	document.getElementById('brightnessValue').innerText = brightnessValue.toString();
}

//switch on/off function for combining two images
function switchCombine(turn) {
	if (turn) {
		if (combineMode == -1) resetImage();
		else combineImages(0);
		combine = true;
		document.getElementById('msg').innerText = 'Use the above to upload the second image.';
	} else {
		combine = false;
		document.getElementById('msg').innerText = instruction;
	}
}

//combine two images with different blending modes
function combineImages(step) {
	if (step == 0) showPanel('combinePanel');

	//select blending mode
	const modeName = ['XOR', 'OR', 'AND', 'ADD', 'MIN', 'MAX'];
	combineMode = (combineMode + step + 6) % 6;
	document.getElementById('combineMode').innerText = modeName[combineMode];

	//compute blending
	currentImageData = structuredClone(originalImageData);
	let pixels1 = currentImageData.data;
	let pixels2 = secondImageData.data;
	for (let i = 0; i < pixels1.length; i++){
		if (i % 4 == 3) continue;
		let value;
		switch (combineMode) {
			case 0:	//xor
				value = pixels1[i] ^ pixels2[i];
				break;
			case 1:	//or
				value = pixels1[i] | pixels2[i];
				break;
			case 2:	//and
				value = pixels1[i] & pixels2[i];
				break;
			case 3:	//add
				value = pixels1[i] + pixels2[i];
				if (value > 255) value = 255;
				break;
			case 4:	//min
				value = Math.min(pixels1[i], pixels2[i]);
				break;
			case 5:	//max
				value = Math.max(pixels1[i], pixels2[i]);
				break;
		}
		pixels1[i] = value;
	}
	draw(currentImageData);
}

//view content after the end of image
function hiddenContent() {
	if (content != null) {
		showPanel('contentPanel');
		return;
	}
	const reader = new FileReader();
	reader.onload = () => {
		const rawData = reader.result;
		//detect PNG/JPG from file header
		if (rawData.substr(0, 8) != hexToAscii('89504e470d0a1a0a') && rawData.substr(0, 2) != hexToAscii('ffd8')) {
			document.getElementById('msg').innerText = 'This function only supports PNG and JPG!';
			return;
		}

		//traverse till the end of image
		let start;
		if (rawData.substr(0, 8) == hexToAscii('89504e470d0a1a0a')) 
			start = rawData.indexOf(hexToAscii('0000000049454e44ae426082')) + 12;
		else {
			//skip incorrect FFD9 (end of JPEG) using header sizes
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

		//detect common file format from header
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

//save text/binary string for various functions
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

//save canvas image as PNG
function saveImage() {
	const save = document.getElementById('fileSave');
	let fakeCanvas = document.createElement('canvas');
	let fakeCtx = fakeCanvas.getContext('2d');
	fakeCanvas.width = imageWidth;
	fakeCanvas.height = imageHeight;
	fakeCtx.putImageData(currentImageData, 0, 0);
	save.href = fakeCanvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
	save.download = 'edited.png';
	save.click();
}

//view or hide the full EXIF table
function fullExif(){
	if (document.getElementById('fullExif').innerText == 'View full EXIF') {
		document.getElementById('exifTable').style.display = 'block';
		document.getElementById('fullExif').innerText = 'Hide full EXIF';
	} else {
		document.getElementById('exifTable').style.display = 'none';
		document.getElementById('fullExif').innerText = 'View full EXIF';
	}
}

//view EXIF
function viewExif() {
	if (exif) {
		showPanel('exifPanel');
		return;
	}
	document.getElementById('msg').innerText = 'Loading...';

	//apply PHPExifTool
	let formData = new FormData();
	formData.append('image[]', rawFile);
	fetch('exif.php', {
		method: 'POST',
		body: formData
	})
	.then((response) => response.json())
	.then((data) => {
		//a selection of commonly used EXIF tags in riddles
		const selection = ['FileType', 'ImageWidth', 'ImageHeight', 'ImageDescription', 'ModifyDate',
			'Artist', 'Copyright', 'DateTimeOriginal', 'CreateDate', 'UserComment', 'OwnerName',
			'GPSLatitudeRef', 'GPSLatitude', 'GPSLongitudeRef', 'GPSLongitude', 'ObjectName',
			'Keywords', 'Headline', 'Caption-Abstract', 'Location', 'Creator', 'Description',
			'Title', 'Label', 'Rating', 'Comment', 'GPSPosition', 'ThumbnailImage', 'XPAuthor',
			'XPComment', 'XPKeywords', 'XPSubject', 'XPTitle'];

		//initialize EXIF tables
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

		//go through EXIF groups
		exifData.forEach((group) => {
			//create group header
			row = fullTable.insertRow(-1);
			let header = document.createElement('th');
			header.colSpan = 2;
			header.innerText = group[0];
			row.appendChild(header);

			//go through EXIF entries in each group
			Object.entries(group[1]).forEach((entry) => {
				row = fullTable.insertRow(-1);
				tag = row.insertCell(0);
				tag.innerText = entry[0];
				tag.classList.add('exifItem');
				value = row.insertCell(1);

				if (entry[0] == 'ThumbnailImage') {
					//display thumbnail image
					let imageArray = new Uint8Array(entry[1].length);
					for (let i = 0; i < entry[1].length; i++)
						imageArray[i] = entry[1].charCodeAt(i);
					const blob = new Blob([imageArray]);
					let img = document.createElement('img');
					img.src = URL.createObjectURL(blob);
					value.appendChild(img);
				}

				else if (/^[\u0020-\u007e]*$/.test(entry[1]))
					//printable text content
					value.innerText = entry[1];

				else {
					//create link for non-printable ASCII content
					const blob = new Blob([entry[1]], {type:"text/plain;charset=UTF-8"});
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

//initialize the GIF frame viewer
function initFrame() {
	if (rawFile.type != 'image/gif') {
		document.getElementById('msg').innerText = 'This function only supports GIF!';
		return;
	}
	if (framesData == null) {
		document.getElementById('msg').innerText = 'Loading...';

		//load GIF into SuperGif library
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

//view GIF frames one by one
function viewFrame(step) {
	//select frame
	const gifLength = framesData.get_length();
	frameNo = (frameNo + step + gifLength) % gifLength;
	framesData.move_to(frameNo);
	const currentFrame = framesData.get_frames()[frameNo];
    
	//export frame data to canvas
	draw(currentFrame.data);
    
	const frameNoDisplay = frameNo + 1;
	document.getElementById('frameNo').innerText = frameNoDisplay.toString();
	document.getElementById('frameDur').innerText = currentFrame.delay * 10 + "ms";
}

//initialize LSB panel
function initLSB() {
	showPanel('lsbPanel');
	document.getElementById('lsbPreview').innerText = lsbData;
}

//extract LSB data
function extractLSB() {
	lsbData = '';

	//collect user options
	const rgbMap = {'r': 0, 'g': 1, 'b': 2};
	let checked = [];
	for (let i = 0; i < 3; i++) { //channels
		const color = document.getElementById('bitPlaneOrder').value[i]; //color order
		let colorChecked = [];
		for (let j = 0; j < 8; j++) { //bits
			let digit;
			if (document.getElementById('bitOrder').value == 'lsb')
				digit = j; //LSB order
			else
				digit = 7 - j; //MSB order
			if (document.getElementById(color + digit.toString()).checked)
				colorChecked.push(digit);
		}
		checked.push([rgbMap[color], colorChecked]);
	}

	//extract selected bits
	const pixels = originalImageData.data;
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
			//row order
			start += 4;
		else {
			//column order
			start = start + 4 * canvas.width;
			if (start >= pixels.length)
				start = start - pixels.length + 4;
		}
	}
	document.getElementById('lsbPreview').innerText = lsbData;
}

function initAdvanced() {
	resetImage();
	if (hasColorTable)
		createColorTable();
	showPanel('advancedPanel');
}

function advancedHelp() {
	alert('Enter JavaScript expressions to manipulate pixel values in custom ways.\n' +
	'The results are rounded off to integers between 0 and 255.\n' +
	'Lock the color picker to execute on one color only.\n' +
	'Allowed characters: r, g, b, 0-9, .+-*/%()=<>!&|^?:');
}

//scripting for color values
function executeExpressions() {
	const rgb = ['r', 'g', 'b'];
	let ex = [];

	//check for allowed formulas
	for (let i = 0; i < 3; i++) {
		ex.push(document.getElementById(rgb[i] + 'Expression').value);
		if (ex[i] === '') ex[i] = rgb[i];
		if (!/^[0-9rgb.+\-*\/%()=<>!&|^?: ]*$/.test(ex[i])) {
			document.getElementById('msg').innerText = 'Invalid expressions!';
			return;
		}
	}

	const backupImageData = structuredClone(currentImageData);
	try {
		let fn = [];
		let color = [];
		let coord = 0;
		if (document.getElementById('x').innerText.length > 0)
			coord = parseInt(document.getElementById('y').innerText) * imageWidth + 
				parseInt(document.getElementById('x').innerText);
		let pixels = currentImageData.data;

		//create JS functions from formulas
		for (let i = 0; i < 3; i++) {
			fn.push(Function('r', 'g', 'b', 'return ' + ex[i]));
			color.push(pixels[4 * coord + i]);
		}

		//compute formulas rounded to integer
		for (let i = 0; i < pixels.length; i += 4) {
			if (locked && (pixels[i] !== color[0] || pixels[i+1] !== color[1] || pixels[i+2] !== color[2]))
				continue;
			let pxval = [];

			//prevent results going beyond 0~255
			for (let j = 0; j < 3; j++) {
				let val = Math.round(fn[j](pixels[i], pixels[i+1], pixels[i+2]));
				val = val < 0 ? 0 : val > 255 ? 255 : val;
				pxval.push(val);
			}
			for (let j = 0; j < 3; j++)
				pixels[i+j] = pxval[j];
		}
		draw(currentImageData);
		updateColors();
		if (hasColorTable)
			createColorTable();
		document.getElementById('msg').innerText = instruction;
	} catch {
		document.getElementById('msg').innerText = 'Invalid expressions!';
		currentImageData = structuredClone(backupImageData);
		draw(currentImageData);
	}
}

//assign random color to each pixel color
function randomColorMap(){
	//initialize color map
	const colorMap = new Map();
	let pixels = currentImageData.data;
	for (let i = 0; i < pixels.length; i += 4)
		colorMap.set([pixels[i], pixels[i + 1], pixels[i + 2]].join(','), 0);

	if (colorMap.size < 10605224) {
		//algorithm for fewer colors - checking duplicates
		const randomSet = new Set();
		for (const [color, val] of colorMap) {
			let randomColor = Math.floor(Math.random() * 16777216);
			while (randomSet.has(randomColor))
				randomColor = Math.floor(Math.random() * 16777216);
			colorMap.set(color, randomColor);
			randomSet.add(randomColor);
		}
	} else {
		//algorithm for more colors - precomputing all colors and select
		let allColors = Array.from({ length: 16777216 }, (value, index) => index);
		for (const [color, val] of colorMap) {
			const randomIndex = Math.floor(Math.random() * allColors.length);
			colorMap.set(color, allColors[randomIndex]);
			//remove assigned color
			allColors[randomIndex] = allColors[allColors.length - 1];
			allColors.pop();
		}
	}

	//output color map
	for (let i = 0; i < pixels.length; i += 4) {
		let finalColor = colorMap.get([pixels[i], pixels[i + 1], pixels[i + 2]].join(','));
		for (let j = 0; j < 3; j++) {
			pixels[i + j] = finalColor % 256;
			finalColor = Math.floor(finalColor / 256);
		}
	}
	draw(currentImageData);
	updateColors();
	if (hasColorTable)
		createColorTable();
}

function initBarcode() {
	showPanel('barcodePanel');
	document.getElementById('barcodeContent').innerText = barcodeData;
}

//scan common barcodes
function barcode() {
	document.getElementById('msg').innerText = 'Loading...';
	const barcodeReader = new Html5Qrcode('barcodeReader');
	let fakeCanvas = document.createElement('canvas');
	fakeCanvas.width = imageWidth;
	fakeCanvas.height = imageHeight;
	let fakeCtx = fakeCanvas.getContext('2d');
	fakeCtx.putImageData(originalImageData, 0, 0);
	fakeCanvas.toBlob((blob) => {
		const barcodeFile = new File([blob], "image.png", {type: "image/png"});
		barcodeReader.scanFile(barcodeFile, true)
		.then(decoded => {
			barcodeData = decoded;
			document.getElementById('barcodeContent').innerText = barcodeData;
			document.getElementById('msg').innerText = instruction;
		})
		.catch(err => {
			barcodeData = '';
			document.getElementById('barcodeContent').innerText = 'Error ' + err;
			document.getElementById('msg').innerText = instruction;
		});
	});
}
