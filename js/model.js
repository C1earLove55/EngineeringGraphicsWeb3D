import * as THREE from "../lib/three.module.js";
import {
  OrbitControls
} from "../lib/OrbitControls.js";
import {
  GUI
} from "../lib/lil-gui.module.min.js";
import Stats from "../lib/stats.module.js";
import {
  FBXLoader
} from "../lib/FBXLoader.js";
import * as BufferGeometryUtils from "../lib/BufferGeometryUtils.js";

let camera, scene, renderer, object, stats;
let planes, planeObjects, planeHelpers;
let clock;

const params = {
  animate: true,
  planeX: {
    constant: 0,
    negated: false,
    displayHelper: false,
  },
  planeY: {
    constant: 0,
    negated: false,
    displayHelper: false,
  },
  planeZ: {
    constant: 0,
    negated: false,
    displayHelper: false,
  },
};

init();
animate();

function createPlaneStencilGroup(geometry, plane, renderOrder) {

  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial();
  baseMat.depthWrite = false;
  baseMat.depthTest = false;
  baseMat.colorWrite = false;
  baseMat.stencilWrite = true;
  baseMat.stencilFunc = THREE.AlwaysStencilFunc;

  // back faces
  const mat0 = baseMat.clone();
  mat0.side = THREE.BackSide;
  mat0.clippingPlanes = [plane];
  mat0.stencilFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZPass = THREE.IncrementWrapStencilOp;

  const mesh0 = new THREE.Mesh(geometry, mat0);
  mesh0.renderOrder = renderOrder;
  group.add(mesh0);

  // front faces
  const mat1 = baseMat.clone();
  mat1.side = THREE.FrontSide;
  mat1.clippingPlanes = [plane];
  mat1.stencilFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZPass = THREE.DecrementWrapStencilOp;

  const mesh1 = new THREE.Mesh(geometry, mat1);
  mesh1.renderOrder = renderOrder;

  group.add(mesh1);

  return group;

}

function init() {
  clock = new THREE.Clock();

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    36,
    window.innerWidth / window.innerHeight,
    0.01,
    1000000
  );
  camera.position.set(2, 2, 2);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  planes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  ];

  planeHelpers = planes.map((p) => new THREE.PlaneHelper(p, 2, 0xffffff));
  planeHelpers.forEach((ph) => {
    ph.visible = false;
    scene.add(ph);
  });

  object = new THREE.Group();
  scene.add(object);

  // Set up clip plane rendering
  planeObjects = [];

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true
  });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263238);
  // renderer.setClearColor(0xffffff);
  window.addEventListener("resize", onWindowResize);
  document.body.appendChild(renderer.domElement);

  renderer.localClippingEnabled = true;

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 0.01;
  controls.maxDistance = 1000000;
  controls.update();

  loadFBX();

  setGUI();
}

const planeGeom = new THREE.PlaneGeometry(4, 4);

function loadFBX() {
  const manager = new THREE.LoadingManager(); //5_2 3_20
  new FBXLoader(manager).load("../models/3_8.fbx", (fbx) => {
    console.log('fbx',fbx);

    fbx.traverse((child) => {
      if (child.isMesh) {

        if (Array.isArray(child.material)) {
          for (let i = 0; i < child.material.length; i++) {
            child.material[i].side = 2;
            child.material[i].depthWrite = true;
            child.material[i].transparent = false;
            child.material[i].opacity = 1;
          }
        } else {
          child.material.side = 2;
          child.material.depthWrite = true;
          child.material.transparent = false;
          child.material.opacity = 1;
        }
      }
    });
    let gltfs = fbx.clone();
    let gltfss = fbx.clone();
    checkModel(gltfs);
    checkModel(gltfss);

    let size = 0.001; //0.008;
    gltfs.scale.set(size, size, size);
    gltfss.scale.set(size, size, size);

    gltfs.castShadow = true;
    gltfs.renderOrder = 6;

    gltfs.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.renderOrder = 6;

        if (Array.isArray(child.material)) {
          for (let i = 0; i < child.material.length; i++) {
            child.material[i].metalness = 0.1;
            child.material[i].roughness = 0.75;
            child.material[i].clippingPlanes = planes;
            // child.material[i].clipIntersection = true;
            // child.material[i].clipShadows = true;
            // child.material[i].shadowSide = THREE.DoubleSide;
          }
        } else {
          child.material.metalness = 0.1;
          child.material.roughness = 0.75;
          child.material.clippingPlanes = planes;
          // child.material.clipIntersection = true;
          // child.material.clipShadows = true;
          // child.material.shadowSide = THREE.DoubleSide;
        }
      }
    });
    object.add(gltfs);

    //补面
    gltfss.updateMatrixWorld(true);

    let geometryArr = [];
    gltfss.traverse((child) => {
      let matrixWorld = child.matrixWorld;
      if (child.isMesh) {
        let geometry1 = child.geometry.clone();
        geometry1.applyMatrix4(matrixWorld);
        geometryArr.push(geometry1);
      }
    });

    let gg = BufferGeometryUtils.mergeBufferGeometries(geometryArr);

    for (let i = 0; i < 3; i++) {
      const poGroup = new THREE.Group();
      const plane = planes[i];
      const stencilGroup = createPlaneStencilGroup(gg, plane, i + 1);

      const planeMat = new THREE.MeshStandardMaterial({
        color: 0xdd0000, //0xe91e63,
        metalness: 0.1,
        roughness: 0.75,
        // depthTest:false,
        side: 2,

        clippingPlanes: planes.filter((p) => p !== plane),

        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      });
      const po = new THREE.Mesh(planeGeom, planeMat);
      po.onAfterRender = function (renderer) {
        renderer.clearStencil();
      };

      po.renderOrder = i + 1.1;

      object.add(stencilGroup);
      poGroup.add(po);
      planeObjects.push(po);
      scene.add(poGroup);
    }

  });
}



function checkModel(gltf) {
  gltf.traverse((child) => {
    if (child.type == "Object3D") {
      child.traverse((childs) => {
        if (childs.isMesh) {
          child.parent.add(childs.clone());
        }
      });
      child.parent.remove(child);
    }
  });
}

function setGUI() {
  // GUI
  const gui = new GUI();
  gui.add(params, "animate");

  const planeX = gui.addFolder("planeX");
  planeX
    .add(params.planeX, "displayHelper")
    .onChange((v) => (planeHelpers[0].visible = v));
  planeX
    .add(params.planeX, "constant")
    .min(-1)
    .max(1)
    .onChange((d) => (planes[0].constant = d));
  planeX.add(params.planeX, "negated").onChange(() => {
    planes[0].negate();
    params.planeX.constant = planes[0].constant;
  });
  planeX.open();

  const planeY = gui.addFolder("planeY");
  planeY
    .add(params.planeY, "displayHelper")
    .onChange((v) => (planeHelpers[1].visible = v));
  planeY
    .add(params.planeY, "constant")
    .min(-1)
    .max(1)
    .onChange((d) => (planes[1].constant = d));
  planeY.add(params.planeY, "negated").onChange(() => {
    planes[1].negate();
    params.planeY.constant = planes[1].constant;
  });
  planeY.open();

  const planeZ = gui.addFolder("planeZ");
  planeZ
    .add(params.planeZ, "displayHelper")
    .onChange((v) => (planeHelpers[2].visible = v));
  planeZ
    .add(params.planeZ, "constant")
    .min(-1)
    .max(1)
    .onChange((d) => (planes[2].constant = d));
  planeZ.add(params.planeZ, "negated").onChange(() => {
    planes[2].negate();
    params.planeZ.constant = planes[2].constant;
  });
  planeZ.open();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const delta = clock.getDelta();

  requestAnimationFrame(animate);

  for (let i = 0; i < planeObjects.length; i++) {
    const plane = planes[i];
    const po = planeObjects[i];
    plane.coplanarPoint(po.position);
    po.lookAt(
      po.position.x - plane.normal.x,
      po.position.y - plane.normal.y,
      po.position.z - plane.normal.z
    );
  }

  stats.begin();
  renderer.render(scene, camera);
  stats.end();
}