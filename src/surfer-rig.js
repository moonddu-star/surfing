import * as THREE from '../public/vendor/three/three.module.min.js';

const up = new THREE.Vector3(0, 1, 0);
const material = (color, roughness = .65) => new THREE.MeshStandardMaterial({ color, roughness });

function boardGeometry() {
  const positions = [], indices = [], colors = [];
  const steps = 44, sides = 16;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, z = -1.72 + u * 3.02;
    const width = .45 * Math.pow(Math.sin(Math.PI * u), .57) * (.83 + u * .23);
    const rocker = .07 + Math.pow(Math.max(0, .45 - u), 2) * .80;
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      positions.push(Math.cos(angle) * width, rocker + Math.sin(angle) * .065, z);
      const shade = Math.sin(angle) > .1 ? 1 : .64;
      colors.push(shade, shade, shade);
      if (i < steps && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export class SurferRig {
  constructor({ crew = false, board = '#d8f76d' } = {}) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.skin = material('#d99973', .71);
    this.suit = material(crew ? '#417d82' : '#f18e56', .8);
    this.dark = material('#132e3e', .77);
    this.cream = material('#fff0d9', .67);
    this.boardMaterial = new THREE.MeshPhysicalMaterial({ color: board, roughness: .24, clearcoat: .85, clearcoatRoughness: .18, vertexColors: true });
    this.board = new THREE.Mesh(boardGeometry(), this.boardMaterial); this.root.add(this.board);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.025, .013, 2.35), material('#23494d', .4));
    stripe.position.set(0, .145, -.13); this.root.add(stripe);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(.42, .022, .42), this.dark); pad.position.set(0, .15, .87); this.root.add(pad);
    for (const x of [-.2, .2]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(.13, .29, 3), this.dark);
      fin.position.set(x, -.09, .91); fin.rotation.z = Math.PI; this.root.add(fin);
    }
    const leashCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(.04,.11,1.25),new THREE.Vector3(.32,.05,1.40),new THREE.Vector3(.33,.08,.85),new THREE.Vector3(.17,.28,.60)]);
    this.root.add(new THREE.Mesh(new THREE.TubeGeometry(leashCurve, 20, .012, 4, false), this.dark));
    const torsoGeometry = new THREE.CylinderGeometry(.23, .18, .49, 14);
    this.torso = new THREE.Mesh(torsoGeometry, this.suit); this.body.add(this.torso);
    this.chestBand = new THREE.Mesh(new THREE.CylinderGeometry(.227, .222, .065, 14), this.cream); this.body.add(this.chestBand);
    this.hips = new THREE.Mesh(new THREE.SphereGeometry(.23, 14, 10), this.dark); this.hips.scale.set(1, .8, .85); this.body.add(this.hips);
    this.head = new THREE.Group();
    const face = new THREE.Mesh(new THREE.SphereGeometry(.145, 18, 14), this.skin); face.scale.set(.85, 1.15, 1); this.head.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.153, 18, 12, 0, Math.PI * 2, 0, Math.PI * .60), material('#202c35'));
    hair.rotation.x = -.16; hair.position.y = .025; this.head.add(hair);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 8), this.skin); nose.position.set(0, 0, -.143); this.head.add(nose);
    this.body.add(this.head);
    this.bones = {};
    for (const [name, radius, mat] of [
      ['thighL', .11, this.dark], ['thighR', .11, this.dark], ['shinL', .075, this.skin], ['shinR', .075, this.skin],
      ['upperL', .071, this.suit], ['upperR', .071, this.suit], ['foreL', .048, this.skin], ['foreR', .048, this.skin], ['neck', .075, this.skin]
    ]) {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 1, 4, 10), mat);
      this.bones[name] = { mesh, radius }; this.body.add(mesh);
    }
    this.hands = ['left', 'right'].map(() => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), this.skin); mesh.scale.set(.8, .6, 1.3); this.body.add(mesh); return mesh; });
    this.feet = ['left', 'right'].map(() => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 8), this.skin); mesh.scale.set(.8, .48, 1.8); this.body.add(mesh); return mesh; });
    this.vector = new THREE.Vector3(); this.direction = new THREE.Vector3();
    this.pose(0, 0);
  }

  bone(name, a, b) {
    const { mesh, radius } = this.bones[name];
    this.vector.set(...a); this.direction.set(...b).sub(this.vector);
    mesh.position.copy(this.vector).addScaledVector(this.direction, .5);
    mesh.quaternion.setFromUnitVectors(up, this.direction.clone().normalize());
    mesh.scale.y = this.direction.length() / (1 + radius * 2);
  }

  pose(time, air = 0, carve = 0) {
    const crouch = Math.sin(time * 1.3) * .018 - air * .08;
    const hip = [.04 + carve * .10, .84 + crouch, .10];
    const shoulder = [-.10 + carve * .14, 1.30 + crouch, -.11];
    this.torso.position.set((hip[0] + shoulder[0]) / 2, (hip[1] + shoulder[1]) / 2 + .03, (hip[2] + shoulder[2]) / 2);
    this.direction.set(shoulder[0] - hip[0], shoulder[1] - hip[1], shoulder[2] - hip[2]).normalize();
    this.torso.quaternion.setFromUnitVectors(up, this.direction);
    this.chestBand.position.copy(this.torso.position).addScaledVector(this.direction, .095); this.chestBand.quaternion.copy(this.torso.quaternion);
    this.hips.position.set(...hip);
    this.bone('thighL', [hip[0]-.12,hip[1],hip[2]-.05], [-.22,.58,-.60]);
    this.bone('shinL', [-.22,.58,-.60], [-.03,.23,-.63]);
    this.bone('thighR', [hip[0]+.12,hip[1],hip[2]+.06], [.34,.49,.47]);
    this.bone('shinR', [.34,.49,.47], [.06,.23,.63]);
    this.feet[0].position.set(-.025,.19,-.64); this.feet[0].rotation.y = .85;
    this.feet[1].position.set(.025,.19,.65); this.feet[1].rotation.y = .6;
    const leftElbow = [-.54, 1.03 + air * .48, -.02], leftHand = [-.88, .90 + air * .87, -.27];
    const rightElbow = [.33, 1.05 + air * .42, -.36], rightHand = [.61, 1.15 + air * .60, -.64];
    this.bone('upperL', [shoulder[0]-.18,shoulder[1]-.02,shoulder[2]], leftElbow);
    this.bone('foreL', leftElbow, leftHand);
    this.bone('upperR', [shoulder[0]+.18,shoulder[1]-.02,shoulder[2]], rightElbow);
    this.bone('foreR', rightElbow, rightHand);
    this.hands[0].position.set(...leftHand); this.hands[1].position.set(...rightHand);
    this.bone('neck', [shoulder[0],shoulder[1],shoulder[2]], [shoulder[0]-.03,shoulder[1]+.15,shoulder[2]-.02]);
    this.head.position.set(shoulder[0]-.035,shoulder[1]+.29,shoulder[2]-.04);
    this.head.rotation.y = -.32;
  }
}
