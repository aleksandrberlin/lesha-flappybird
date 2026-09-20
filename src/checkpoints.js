// Checkpoint screens: every few points the run pauses on a photo.
// Photos live in assets/checkpoints/ and are inlined by tools/make_checkpoints.js
// into src/checkpoints-data.js. Add one with:
//   python3 tools/make_checkpoints.py 3 photo.jpg --crop cx,cy,side
// and then list its slot in `order` below.
const CHECKPOINTS = {
  every: 10,              // очков между чекпоинтами
  order: ["1", "2"],      // фото идут по кругу: 1, 2, 1, 2, ...
  captions: {
    "1": "барселона одобряет",
    "2": "кто-то проголодался",
  },
  cheers: [
    "так держать!",
    "летим дальше!",
    "неплохо идёшь",
    "разогрелся",
  ],
};
