/** Random pools from the artifact (A1), word for word. Variety comes from these, not from the model's temperature. */

export const PALETTES = ['sage green and oatmeal','cobalt blue and crisp white','chocolate brown and cream','dusty rose and soft grey','butter yellow and washed denim blue','all black with charcoal','burgundy and camel','lavender and white','olive and tan','terracotta and sand','baby blue and heather grey','emerald green and ivory','powder pink and white','navy and cherry red','mint green and white','cherry red and cream','slate blue and stone','espresso brown and caramel'];

export const HAIRSTYLES = ['a messy low bun with loose face-framing pieces','a sleek high ponytail','loose soft waves worn down','half-up half-down with a small clip','a single loose side braid over one shoulder','a claw-clip twist at the back of the head','two low loose braids','sleek and straight with a middle part, worn down','a tousled top knot','a low ponytail tied with a silk scarf','tucked behind both ears, worn down','loose curls swept to one side','a slicked-back low bun','air-dried natural texture with a deep side part'];

export const POSE_HINTS = ['a three-quarter turn toward the camera','sitting cross-legged','hugging one knee to the chest','leaning on one hand with the head tilted','standing with weight on one hip','glancing away over one shoulder','one hand running through the hair','mid-laugh, glancing down','leaning against a wall or doorframe','both hands holding a mug or the phone close'];

export const SOCIAL_POSES = [
'a high mirror selfie with the phone held up, hip popped to one side and the free hand in a back pocket',
'an over-the-shoulder look back at the camera with the chin slightly down',
'a peace sign near the face with a playful head tilt',
'sitting on the edge of a surface with legs crossed, leaning forward on one elbow',
'a candid mid-walk toward the camera, glancing off to the side',
'one hand pushing the hair back off the forehead, eyes half closed, soft smile',
'a mirror selfie with the phone covering half the face and the other hand on the hip',
'squatting low with forearms resting on the knees, looking up at the lens',
'leaning back on both hands with the face tilted toward the light',
'holding a coffee cup near the chin and looking off camera',
'lying on the stomach with the chin resting in both hands and ankles crossed in the air',
'standing side-on with one knee bent, looking down at the phone',
'both arms stretched overhead mid-yawn with a sleepy smile',
'sitting cross-legged hugging a pillow and laughing',
'leaning a shoulder against a wall with arms loosely crossed and a slight smirk',
'sitting on the floor with knees up, one arm draped over them, looking straight into the lens',
'tucking a strand of hair behind one ear while glancing down and smiling',
'caught mid-laugh with the head thrown back and one hand on the chest',
'sitting sideways in a chair with legs draped over the armrest, looking at the camera',
'kneeling upright on a bed or rug, hands resting on the thighs, head tilted',
'adjusting a sleeve or cuff while looking off to one side, editorial and candid',
'lying on the back with hair fanned out, phone held overhead as if taking a selfie',
'perched on a windowsill or ledge with one knee pulled up, gazing outside',
'walking away from the camera and glancing back over the shoulder mid-step',
'hands in the front pockets, shoulders relaxed, weight on one leg, slight smile',
'blowing a playful kiss toward the lens with one hand',
'covering a laugh with one hand, eyes crinkled, shoulders raised',
'resting the chin on a fist, elbow on a table, dreamy look off camera',
'sitting on steps with elbows on knees, leaning forward toward the lens',
'stretching one arm along a wall or railing, body angled away, face turned back',
'holding sunglasses lowered on the nose with one finger, looking over them',
'twirling the ends of the hair around a finger with a sideways glance',
'spinning mid-motion so the hair and clothes swing out, candid blur in the hem',
'leaning into the mirror to check makeup, eyes on the reflection',
'sitting in a car seat with one wrist draped over the steering wheel, looking at the camera',
'lying on the side propped on one elbow, head resting in the hand',
'crouching beside a pet or object and looking up with a grin',
'holding a phone at arm length low for a high-angle-from-below selfie, chin tucked',
'hands framing the face, fingertips on the cheeks, wide-eyed playful look',
'one leg crossed in front of the other while standing, hands clasped behind the back',
'sitting on a countertop with legs dangling and a snack in one hand',
'mid-sip from a drink with a straw, eyes up at the lens',
'one arm wrapped around the waist, other hand touching the collarbone, looking down',
'leaning out of a doorway with one hand on the frame, head peeking into the shot',
'jumping slightly off the ground with arms out, big candid smile',
'sitting backwards on a chair with arms folded over the backrest',
'pulling a hoodie or jacket collar up around the face with both hands',
'lying across a bed diagonally with the phone held up, feet kicked up behind',
'looking down at the ground with a shy smile, hands behind the back',
'a profile shot with the chin lifted and eyes closed toward the light',
'fixing a ponytail with both hands raised behind the head, elbows out',
'sitting on the floor against the bed, one leg stretched out, other knee up',
'holding a bouquet or tote in the crook of one arm, walking toward the camera',
'tying a shoelace with one foot up on a step, looking up at the lens',
'leaning forward toward the camera with hands on the knees, playful grin',
'reading a book or phone while lounging, caught looking up at the camera',
'hugging the knees on a couch with the cheek resting on them',
'arms crossed loosely over the chest, head tilted, confident half smile',
'pointing at the camera with a laugh, other hand on the hip',
'sitting on a swing or stool, legs crossed at the ankles, hands in the lap'];

export function shuffleArr<T>(a: readonly T[], random: () => number = Math.random): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
