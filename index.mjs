import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
const mqtt = window.mqtt;

let scene, camera, renderer, rotatingParts = [], motorModels = [];
let rpm = 0;
let manualMode = true;
let valueBoxes = {}; // Stores input boxes to update from MQTT

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 1.5, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 2);
  scene.add(ambientLight);

  const light1 = new THREE.DirectionalLight(0xffffff, 1.2);
  light1.position.set(5, 10, 5);
  scene.add(light1);

  const light2 = new THREE.DirectionalLight(0xffffff, 1.0);
  light2.position.set(-5, -5, 5);
  scene.add(light2);

  const loader = new GLTFLoader();
  loader.load('./electric_motor.glb', (gltf) => {
    for (let i = 0; i < 2; i++) {
      const motorModel = gltf.scene.clone();
      motorModel.scale.set(5, 5, 5);
      motorModel.position.set(i === 0 ? -2.5 : 2.5, -1, 0);
      motorModel.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(motorModel);
      motorModels.push(motorModel);

      motorModel.traverse((child) => {
        if (child.isMesh) {
          const name = child.name.toLowerCase();
          if (['shaft_mat_0', 'vent_mat2_0'].includes(name)) {
            child.material = new THREE.MeshStandardMaterial({ 
              color: 0xffffff,
              metalness: 0.8,
              roughness: 0.2
            });
            rotatingParts.push(child);
          } else {
            child.material = new THREE.MeshStandardMaterial({
              color: 0x0077cc,
              metalness: 0.6,
              roughness: 0.4
            });
          }
        }
      });
    }
  });

  const cost = 87;
  const modeContainer = document.createElement('div');
  modeContainer.style.position = 'absolute';
  modeContainer.style.top = '20px';
  modeContainer.style.width = '100%';
  modeContainer.style.textAlign = 'center';
  modeContainer.style.fontFamily = 'Arial';
  modeContainer.innerHTML = `

    <h1 style="color: #00bfff;">Electric Motor Digital Twin</h1>
    <button id="manualBtn">Manual Mode</button>
    <button id="liveBtn">Node-RED Mode</button>
    <br/><br/>
    <input type="range" id="rpmSlider" min="0" max="3000" value="0" />
    <label id="rpmValue" style="color:white; display:block">RPM: ${cost}</label>
  `;
  document.body.appendChild(modeContainer);

  const rpmSlider = modeContainer.querySelector('#rpmSlider');
  const rpmValue = modeContainer.querySelector('#rpmValue');
  rpmSlider.oninput = () => {
    rpm = parseInt(rpmSlider.value);
    rpmValue.textContent = `RPM: ${rpm}`;
  };

  document.getElementById('manualBtn').onclick = () => {
    manualMode = true;
    rpmSlider.disabled = false;
    rpmSlider.style.opacity = 1;
  };

  document.getElementById('liveBtn').onclick = () => {
    manualMode = false;
    rpmSlider.disabled = true;
    rpmSlider.style.opacity = 0.5;
  };

  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.top = '100px';
  panel.style.right = '20px';
  panel.style.display = 'grid';
  panel.style.gridTemplateColumns = '1fr 1fr';
  panel.style.gap = '10px';
  panel.style.color = '#0f0';
  panel.style.fontFamily = 'Arial';

  const labels = [
    'Voltage', 'Current', 'Temperature', 'Power Factor',
    'RPM', 'Vibration X', 'Vibration Y', 'Vibration Z'
  ];

  labels.forEach(label => {
    const container = document.createElement('div');
    const labelElem = document.createElement('label');
    labelElem.textContent = label;
    labelElem.style.display = 'block';
    labelElem.style.color = '#ffffff';
    labelElem.style.fontWeight = 'bold';
    const valueBox = document.createElement('input');
    valueBox.type = 'text';
    valueBox.value = '--';
    valueBox.readOnly = true;
    valueBox.style.background = '#222';
    valueBox.style.color = '#0f0';
    valueBox.style.padding = '10px';
    valueBox.style.border = 'none';
    valueBox.style.borderRadius = '6px';
    valueBox.style.textAlign = 'center';
    container.appendChild(labelElem);
    container.appendChild(valueBox);
    panel.appendChild(container);
    valueBoxes[label.toLowerCase().replace(/ /g, '_')] = valueBox;
  });

  document.body.appendChild(panel);

  const mqttClient = window.mqtt?.connect?.('wss://test.mosquitto.org:8081');
  if (mqttClient) {
    mqttClient.on('connect', () => {
      console.log('Connected to MQTT broker');
      mqttClient.subscribe('esp32/sensors');
    });
    mqttClient.on('error', (err) => {
      console.error('MQTT Connection Error:', err);
    });
    mqttClient.on('message', (topic, message) => {
      if (!manualMode) {
        const data = JSON.parse(message.toString());
        console.log('MQTT message received:', data);
        rpm = data.rpm;
        if (valueBoxes['rpm']) valueBoxes['rpm'].value = data.rpm;
        if (valueBoxes['voltage']) valueBoxes['voltage'].value = `${data.voltage_red || data.voltage || '--'} V`;
        if (valueBoxes['current']) valueBoxes['current'].value = `${data.current_red || data.current || '--'} A`;
        if (valueBoxes['temperature']) valueBoxes['temperature'].value = `${data.motor_temperature || '--'} °C`;
        if (valueBoxes['power_factor']) valueBoxes['power_factor'].value = `${data.pf_red || '--'}`;
        if (valueBoxes['vibration_x']) valueBoxes['vibration_x'].value = `${data.vibration_x || '--'} g`;
        if (valueBoxes['vibration_y']) valueBoxes['vibration_y'].value = `${data.vibration_y || '--'} g`;
        if (valueBoxes['vibration_z']) valueBoxes['vibration_z'].value = `${data.vibration_z || '--'} g`;
      }
    });
  }
}

function animate() {
  requestAnimationFrame(animate);
  const radiansPerFrame = (rpm * 2 * Math.PI) / 60 / 60;
  rotatingParts.forEach(part => {
    part.rotation.z += radiansPerFrame;
  });
  renderer.render(scene, camera);
}
