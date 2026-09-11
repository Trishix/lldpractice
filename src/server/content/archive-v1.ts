import "server-only";

import { ProblemPackageSchema } from "../../domain/schemas";
import { DefaultScorePolicy } from "../../domain/score-policy";
import type {
  ConceptQuestion,
  Language,
  McqEvaluator,
  McqResult,
  ProblemPackage,
  PublicProblemSnapshot,
  RubricCriterion,
} from "../../domain/types";

const SOURCE = "https://github.com/ashishps1/awesome-low-level-design/tree/31595db8c21a8f7785b2ef45d90f16fd8053abad";
const COMMIT = "31595db8c21a8f7785b2ef45d90f16fd8053abad";
const LANGUAGES: Language[] = ["java", "python", "cpp"];

type Category = ConceptQuestion["category"];
type Program = { expectedOutput: string; java: string; python: string; cpp: string };
type ConceptSeed = {
  slug: string;
  category: Category;
  tag: string;
  prompt: string;
  assumptions: string;
  choices: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  explanations: [string, string, string, string];
  program: Program;
};

function program(expectedOutput: string, python: string, java: string, cpp: string): Program {
  return {
    expectedOutput,
    python: `${python.trim()}\n`,
    java: `public class Main {\n  public static void main(String[] args) {\n${java.trim().split("\n").map((line) => `    ${line}`).join("\n")}\n  }\n}\n`,
    cpp: `#include <iostream>\n#include <map>\n#include <stdexcept>\n#include <vector>\nusing namespace std;\nint main() {\n${cpp.trim().split("\n").map((line) => `  ${line}`).join("\n")}\n}\n`,
  };
}

const tttSeeds: ConceptSeed[] = [
  {
    slug: "row-win", category: "trace", tag: "Row win", assumptions: "The board starts empty and X moves first.",
    prompt: "What exact line does this program print?", choices: ["X_WINS", "O_WINS", "DRAW", "IN_PROGRESS"], correct: 0,
    explanations: ["All three cells in row zero contain X.", "O has no completed line.", "A win takes precedence over a draw.", "The completed row makes the game terminal."],
    program: program("X_WINS", `board = [["X", "X", "X"], ["O", "O", "."], [".", ".", "."]]\nprint("X_WINS" if all(cell == "X" for cell in board[0]) else "IN_PROGRESS")`, `String[][] b = {{"X","X","X"},{"O","O","."},{".",".","."}};\nboolean win = b[0][0].equals("X") && b[0][1].equals("X") && b[0][2].equals("X");\nSystem.out.println(win ? "X_WINS" : "IN_PROGRESS");`, `vector<vector<char>> b={{'X','X','X'},{'O','O','.'},{'.','.','.'}};\nbool win=b[0][0]=='X'&&b[0][1]=='X'&&b[0][2]=='X';\ncout<<(win?"X_WINS":"IN_PROGRESS")<<'\\n';`),
  },
  {
    slug: "alternating-moves", category: "trace", tag: "Alternating legal moves", assumptions: "Only accepted moves advance the turn.",
    prompt: "After three accepted moves, what exact line is printed?", choices: ["X", "O", "X O", "ERROR"], correct: 1,
    explanations: ["X moved on turns one and three, so X is not next.", "Three accepted moves toggle X to O to X and back to O.", "Only one player owns the next turn.", "Every listed move is legal."],
    program: program("O", `turn = "X"\nfor _ in range(3):\n    turn = "O" if turn == "X" else "X"\nprint(turn)`, `String turn = "X";\nfor (int i=0;i<3;i++) turn=turn.equals("X")?"O":"X";\nSystem.out.println(turn);`, `char turn='X';\nfor(int i=0;i<3;i++) turn=turn=='X'?'O':'X';\ncout<<turn<<'\\n';`),
  },
  {
    slug: "occupied-turn", category: "defect", tag: "Occupied move does not consume turn", assumptions: "The second placement targets an occupied cell.",
    prompt: "Which code change would introduce the lost-turn defect that this example avoids?", choices: ["Toggle turn before checking whether the cell is occupied.", "Keep the early continue for occupied cells.", "Store accepted cells in a map.", "Count only accepted placements."], correct: 0,
    explanations: ["Changing turn before validation makes an invalid attempt consume O's turn.", "The early rejection preserves the current player.", "The collection choice does not itself consume a turn.", "Counting accepted placements preserves atomic rejection."],
    program: program("O 1", `cells = {}\nturn = "X"\nfor cell in [0, 0]:\n    if cell in cells:\n        continue\n    cells[cell] = turn\n    turn = "O" if turn == "X" else "X"\nprint(turn, len(cells))`, `java.util.Map<Integer,String> cells=new java.util.HashMap<>();\nString turn="X";\nfor(int cell:new int[]{0,0}) { if(cells.containsKey(cell)) continue; cells.put(cell,turn); turn=turn.equals("X")?"O":"X"; }\nSystem.out.println(turn+" "+cells.size());`, `map<int,char> cells; char turn='X';\nfor(int cell:vector<int>{0,0}) { if(cells.count(cell)) continue; cells[cell]=turn; turn=turn=='X'?'O':'X'; }\ncout<<turn<<' '<<cells.size()<<'\\n';`),
  },
  {
    slug: "win-before-draw", category: "defect", tag: "Last-move win before draw", assumptions: "The ninth move fills the board and completes the bottom row for X.",
    prompt: "Which ordering prevents the last-move-win regression demonstrated by this full board?", choices: ["Check board-full first, then check a win.", "Check a win first, then check board-full for a draw.", "Declare a draw after the eighth move.", "Check only the player who moves next."], correct: 1,
    explanations: ["A full-board check first would misclassify the winning ninth move.", "Win-before-draw preserves the bottom-row win shown by the program.", "A ninth legal move can still decide the game.", "The player who just moved is the only relevant winner candidate."],
    program: program("X_WINS", `board = [["X","O","O"],["O","X","O"],["X","X","X"]]\nwin = all(x == "X" for x in board[2])\nprint("X_WINS" if win else ("DRAW" if all(x != "." for row in board for x in row) else "IN_PROGRESS"))`, `String[][] b={{"X","O","O"},{"O","X","O"},{"X","X","X"}};\nboolean win=b[2][0].equals("X")&&b[2][1].equals("X")&&b[2][2].equals("X");\nboolean full=true; for(String[] r:b) for(String c:r) full&=!c.equals(".");\nSystem.out.println(win?"X_WINS":full?"DRAW":"IN_PROGRESS");`, `vector<vector<char>> b={{'X','O','O'},{'O','X','O'},{'X','X','X'}};\nbool win=b[2][0]=='X'&&b[2][1]=='X'&&b[2][2]=='X'; bool full=true; for(auto&r:b)for(char c:r)full&=c!='.';\ncout<<(win?"X_WINS":full?"DRAW":"IN_PROGRESS")<<'\\n';`),
  },
  {
    slug: "board-legality", category: "responsibility", tag: "Board owns cell legality", assumptions: "Board.place owns bounds and occupancy validation; Game advances turns only on true.",
    prompt: "Which responsibility split best preserves the boundary shown by place?", choices: ["Game indexes cells and Board advances turns.", "Board validates bounds and occupancy; Game sequences players after success.", "Player mutates Board cells directly; Game checks later.", "A UI component owns cell legality and turn order."], correct: 1,
    explanations: ["This reverses the natural owners and leaks board storage.", "Board owns cell validity while Game owns multi-player sequencing.", "Direct mutation bypasses Board invariants.", "Presentation should not own domain rules."],
    program: program("true,false", `cells = set()\ndef place(cell):\n    if cell < 0 or cell >= 9 or cell in cells: return False\n    cells.add(cell); return True\nprint(str(place(4)).lower() + "," + str(place(4)).lower())`, `java.util.Set<Integer> cells=new java.util.HashSet<>();\njava.util.function.IntPredicate place=c->c>=0&&c<9&&cells.add(c);\nSystem.out.println(place.test(4)+","+place.test(4));`, `vector<bool> cells(9); auto place=[&](int c){if(c<0||c>=9||cells[c])return false; cells[c]=true; return true;};\ncout<<boolalpha<<place(4)<<','<<place(4)<<'\\n';`),
  },
  {
    slug: "board-view", category: "responsibility", tag: "Prevent external board mutation", assumptions: "snapshot returns a copy of the board cells.",
    prompt: "Why should Board.snapshot return a copy as demonstrated?", choices: ["To prevent callers from bypassing placement validation by mutating stored cells.", "To make every read advance the turn.", "To let observers replace marks without validation.", "To avoid checking win conditions inside the domain."], correct: 0,
    explanations: ["A detached view protects Board's ownership of legal mutation.", "Reading state must not change turn order.", "Allowing replacement recreates the encapsulation defect.", "Copying protects state; it does not relocate win rules."],
    program: program("X O", `cells = ["X"] + ["."] * 8\nview = cells.copy()\nview[0] = "O"\nprint(cells[0], view[0])`, `String[] cells={"X",".",".",".",".",".",".",".","."};\nString[] view=cells.clone(); view[0]="O";\nSystem.out.println(cells[0]+" "+view[0]);`, `vector<char> cells={'X','.','.','.','.','.','.','.','.'}; vector<char> view=cells; view[0]='O';\ncout<<cells[0]<<' '<<view[0]<<'\\n';`),
  },
  {
    slug: "bounds-first", category: "contract", tag: "Bounds checked before access", assumptions: "The placement function validates coordinates before indexing.",
    prompt: "Which contract ordering safely handles row -1, column 0?", choices: ["Validate both coordinates before reading any cell.", "Read the cell, then validate its coordinates.", "Treat negative rows as the last row.", "Validate occupancy and skip bounds validation."], correct: 0,
    explanations: ["Bounds validation before access guarantees a domain rejection instead of an indexing failure.", "Access-before-validation can throw outside the move contract.", "Negative indexing is not a legal board coordinate.", "Occupancy cannot be checked safely until bounds are known valid."],
    program: program("REJECTED", `def place(row, col):\n    if row < 0 or row >= 3 or col < 0 or col >= 3: return "REJECTED"\n    return "PLACED"\nprint(place(-1, 0))`, `int row=-1,col=0;\nString result=(row<0||row>=3||col<0||col>=3)?"REJECTED":"PLACED";\nSystem.out.println(result);`, `int row=-1,col=0; string result=(row<0||row>=3||col<0||col>=3)?"REJECTED":"PLACED";\ncout<<result<<'\\n';`),
  },
  {
    slug: "atomic-rejection", category: "contract", tag: "Rejected move leaves state unchanged", assumptions: "Cell zero is occupied by X and O is the current player.",
    prompt: "Which postcondition must hold when the occupied retry is rejected?", choices: ["Turn, cells, move count, and outcome all equal their pre-call values.", "Only the board stays unchanged; the turn advances.", "The mark is replaced but the move count stays one.", "The game resets to its initial state."], correct: 0,
    explanations: ["Atomic rejection preserves all observable game state.", "Advancing the turn would consume a player's turn on failure.", "Replacing an occupied mark violates board legality.", "Rejection preserves current state rather than resetting it."],
    program: program("O X 1", `turn, cells, moves = "O", {0: "X"}, 1\ncell = 0\nif cell not in cells:\n    cells[cell] = turn; moves += 1; turn = "X"\nprint(turn, cells[0], moves)`, `String turn="O"; java.util.Map<Integer,String> cells=new java.util.HashMap<>(); cells.put(0,"X"); int moves=1,cell=0;\nif(!cells.containsKey(cell)){cells.put(cell,turn);moves++;turn="X";}\nSystem.out.println(turn+" "+cells.get(0)+" "+moves);`, `char turn='O'; map<int,char> cells{{0,'X'}}; int moves=1,cell=0; if(!cells.count(cell)){cells[cell]=turn;moves++;turn='X';}\ncout<<turn<<' '<<cells[0]<<' '<<moves<<'\\n';`),
  },
  {
    slug: "configurable-size", category: "change", tag: "Configurable board-size win rule", assumptions: "The win rule uses the injected board size rather than a global constant.",
    prompt: "What is the smallest coherent change to support configurable N×N boards?", choices: ["Inject size into Board and derive storage, bounds, and winning-line iteration from it.", "Change only the cells array length.", "Keep global size 3 and special-case a fourth row.", "Move size checks into the UI."], correct: 0,
    explanations: ["One injected size keeps all board invariants consistent, as the loop demonstrates.", "Storage alone leaves bounds and win detection fixed at three.", "Special cases do not provide a general N×N rule.", "The domain must enforce board dimensions independently of presentation."],
    program: program("WIN", `size = 4\nrow = ["X"] * size\nprint("WIN" if all(row[i] == "X" for i in range(size)) else "NO_WIN")`, `int size=4; String[] row={"X","X","X","X"}; boolean win=true; for(int i=0;i<size;i++) win&=row[i].equals("X");\nSystem.out.println(win?"WIN":"NO_WIN");`, `int size=4; vector<char> row(size,'X'); bool win=true; for(int i=0;i<size;i++)win&=row[i]=='X';\ncout<<(win?"WIN":"NO_WIN")<<'\\n';`),
  },
  {
    slug: "accepted-observer", category: "change", tag: "Notify observers after accepted move", assumptions: "Observers are notified only after Board accepts a move.",
    prompt: "Where should observer notification be added so rejected moves emit no event?", choices: ["Before asking Board to place the mark.", "After Board accepts and the complete game state is committed.", "In a finally block around every move attempt.", "Inside the UI before calling Game."], correct: 1,
    explanations: ["Pre-notification can announce a move that later fails.", "Post-commit notification exposes one consistent event per accepted move.", "A finally block runs for rejected attempts too.", "The domain, rather than presentation, knows whether the move committed."],
    program: program("1", `cells, notifications = set(), 0\nfor cell in [2, 2]:\n    if cell in cells: continue\n    cells.add(cell); notifications += 1\nprint(notifications)`, `java.util.Set<Integer> cells=new java.util.HashSet<>(); int notifications=0; for(int cell:new int[]{2,2}) {if(cells.add(cell)) notifications++;}\nSystem.out.println(notifications);`, `vector<bool> cells(9); int notifications=0; for(int cell:vector<int>{2,2}){if(!cells[cell]){cells[cell]=true;notifications++;}}\ncout<<notifications<<'\\n';`),
  },
];

const snakeSeeds: ConceptSeed[] = [
  {
    slug: "exact-overshoot", category: "trace", tag: "Exact 100 and overshoot", assumptions: "These are two independent players or scenarios. Each starts at position 97; exact 100 wins, while overshoot leaves that position unchanged.",
    prompt: "Two independent positions start at 97. The first receives roll 3 and the second receives roll 4. What positions are printed?", choices: ["100 97", "100 101", "97 97", "100 100"], correct: 0,
    explanations: ["The first position lands exactly on 100, while the independent second position overshoots and remains at 97.", "The board never permits a position above 100.", "The second position remains 97, but the first exact landing succeeds.", "The second scenario is an overshoot from 97, not a roll after the first scenario completes."],
    program: program("100 97", `positions = [97, 97]\nrolls = [3, 4]\nfor i in range(2):\n    if positions[i] + rolls[i] <= 100:\n        positions[i] += rolls[i]\nprint(positions[0], positions[1])`, `int[] positions={97,97}; int[] rolls={3,4};\nfor(int i=0;i<2;i++) if(positions[i]+rolls[i]<=100) positions[i]+=rolls[i];\nSystem.out.println(positions[0]+" "+positions[1]);`, `vector<int> positions={97,97}, rolls={3,4}; for(int i=0;i<2;i++) if(positions[i]+rolls[i]<=100)positions[i]+=rolls[i];\ncout<<positions[0]<<' '<<positions[1]<<'\\n';`),
  },
  {
    slug: "one-transition", category: "trace", tag: "One transition on landing", assumptions: "A landing applies at most one board transition even when its endpoint is another transition start.",
    prompt: "What final position is printed when a roll lands on ladder 2→8 and square 8 has a snake to 4?", choices: ["2", "4", "8", "12"], correct: 2,
    explanations: ["Landing transitions are applied once.", "Reaching 4 would require forbidden chaining.", "The ladder endpoint 8 is final for this roll.", "No rule adds the endpoints."],
    program: program("8", `transitions = {2: 8, 8: 4}\nposition = 0 + 2\nposition = transitions.get(position, position)\nprint(position)`, `java.util.Map<Integer,Integer> t=java.util.Map.of(2,8,8,4); int position=0+2; position=t.getOrDefault(position,position); System.out.println(position);`, `map<int,int> t{{2,8},{8,4}}; int position=2; if(t.count(position))position=t[position]; cout<<position<<'\\n';`),
  },
  {
    slug: "no-chaining", category: "defect", tag: "Reject transition chaining defect", assumptions: "The board contains 5→20 and 20→7; only one transition is allowed per roll.",
    prompt: "Which implementation change introduces forbidden transition chaining?", choices: ["Look up the landing square once.", "Return the first transition endpoint.", "Repeat lookup while the current square is a transition start.", "Keep transition data immutable."], correct: 2,
    explanations: ["One lookup implements the stated rule.", "Stopping at the first endpoint prevents chaining.", "A loop would continue from 20 to 7 and violate the one-transition contract.", "Immutability does not cause repeated traversal."],
    program: program("20", `transitions = {5: 20, 20: 7}\nlanded = 5\nprint(transitions.get(landed, landed))`, `java.util.Map<Integer,Integer> t=java.util.Map.of(5,20,20,7); int landed=5; System.out.println(t.getOrDefault(landed,landed));`, `map<int,int> t{{5,20},{20,7}}; int landed=5; cout<<(t.count(landed)?t[landed]:landed)<<'\\n';`),
  },
  {
    slug: "no-six-bonus", category: "defect", tag: "No bonus turn for six", assumptions: "Players A and B alternate after every accepted roll, including six.",
    prompt: "Which branch would introduce the prohibited bonus-turn defect?", choices: ["Always advance current after an accepted non-winning roll.", "Skip advancing current when roll equals six.", "Validate that roll is between one and six.", "Stop advancing after a player wins."], correct: 1,
    explanations: ["Uniform advancement implements this package's rule.", "The special case would incorrectly give A another turn.", "Range validation is required and unrelated to a bonus.", "Terminal play correctly has no next turn."],
    program: program("B", `players = ["A", "B"]\ncurrent = 0\nroll = 6\ncurrent = (current + 1) % len(players)\nprint(players[current])`, `String[] players={"A","B"}; int current=0,roll=6; current=(current+1)%players.length; System.out.println(players[current]);`, `vector<string> players={"A","B"}; int current=0,roll=6; current=(current+1)%players.size(); cout<<players[current]<<'\\n';`),
  },
  {
    slug: "board-validation", category: "responsibility", tag: "Board validates transitions", assumptions: "A board rejects endpoints outside 1 through 100 before a session starts.",
    prompt: "Which object should reject transition 12→101, and when?", choices: ["Player, after landing on 12.", "Board, during construction before a session can use it.", "Die, whenever it rolls 6.", "GameSession, after moving a player to 101."], correct: 1,
    explanations: ["A player does not own board topology, and waiting until landing leaves an invalid board usable.", "Board owns its transition map; endpoint 101 is invalid and construction-time rejection preserves the invariant.", "Die validates values 1 through 6 and has no transition endpoint context.", "Moving to 101 first violates the position bound and duplicates Board's validation rules."],
    program: program("INVALID_ENDPOINT", `start, end = 12, 101\nprint("VALID" if 1 <= start <= 100 and 1 <= end <= 100 else ("INVALID_START" if not 1 <= start <= 100 else "INVALID_ENDPOINT"))`, `int start=12,end=101; String result=start<1||start>100?"INVALID_START":end<1||end>100?"INVALID_ENDPOINT":"VALID"; System.out.println(result);`, `int start=12,end=101; string result=start<1||start>100?"INVALID_START":end<1||end>100?"INVALID_ENDPOINT":"VALID"; cout<<result<<'\\n';`),
  },
  {
    slug: "injected-die", category: "responsibility", tag: "Injected die enables deterministic play", assumptions: "Session depends on a die interface; the test die returns 2 then 3.",
    prompt: "Which dependency should GameSession receive to make the demonstrated roll sequence deterministic in tests?", choices: ["A mutable global random seed.", "A Board that generates random values.", "A Die interface whose test implementation returns 2 then 3.", "A Player subclass for every roll."], correct: 2,
    explanations: ["Global state couples otherwise independent tests.", "Board owns topology rather than randomness.", "An injected Die isolates randomness while production and tests share session logic.", "Roll generation is not a player subtype responsibility."],
    program: program("5", `rolls = iter([2, 3])\nposition = 0\nposition += next(rolls)\nposition += next(rolls)\nprint(position)`, `int[] rolls={2,3}; int position=0; for(int roll:rolls) position+=roll; System.out.println(position);`, `vector<int> rolls={2,3}; int position=0; for(int roll:rolls)position+=roll; cout<<position<<'\\n';`),
  },
  {
    slug: "invalid-die", category: "contract", tag: "Invalid die rejected before mutation", assumptions: "A die value must be in the inclusive range 1 through 6.",
    prompt: "Which precondition and failure guarantee apply to Session.roll(0)?", choices: ["Require 1≤roll≤6 and preserve all session state on rejection.", "Allow zero and reset the player to zero.", "Clamp zero to one and advance the turn.", "Move first, then report that zero was invalid."], correct: 0,
    explanations: ["Range validation occurs before mutation, preserving position 14 and the rest of the session.", "Zero is invalid and rejection never resets position.", "Clamping silently changes the caller's input and session state.", "Mutation before validation breaks atomic failure."],
    program: program("REJECTED 14", `position, roll = 14, 0\nif roll < 1 or roll > 6:\n    result = "REJECTED"\nelse:\n    position += roll; result = "ACCEPTED"\nprint(result, position)`, `int position=14,roll=0; String result; if(roll<1||roll>6){result="REJECTED";}else{position+=roll;result="ACCEPTED";} System.out.println(result+" "+position);`, `int position=14,roll=0; string result; if(roll<1||roll>6)result="REJECTED";else{position+=roll;result="ACCEPTED";} cout<<result<<' '<<position<<'\\n';`),
  },
  {
    slug: "completed-session", category: "contract", tag: "Completed session rejects roll", assumptions: "A winner has already reached 100.",
    prompt: "What is the roll operation's contract after the session has a winner?", choices: ["Accept the roll but ignore its value.", "Reject before consulting the die or mutating any session state.", "Create a new session automatically.", "Move the next player while keeping the winner."], correct: 1,
    explanations: ["Silently accepting obscures an invalid operation.", "The completed-state precondition makes the rejection explicit and side-effect free.", "Session creation is a separate operation.", "No player may move after completion."],
    program: program("REJECTED_COMPLETE", `completed = True\nprint("REJECTED_COMPLETE" if completed else "ROLLED")`, `boolean completed=true; System.out.println(completed?"REJECTED_COMPLETE":"ROLLED");`, `bool completed=true; cout<<(completed?"REJECTED_COMPLETE":"ROLLED")<<'\\n';`),
  },
  {
    slug: "replace-board", category: "change", tag: "Inject a new board without turn changes", assumptions: "Session turn logic receives a board whose only transition is 3→30.",
    prompt: "What is the smallest change that permits a different transition map without changing turn logic?", choices: ["Hard-code the new ladder inside GameSession.", "Subclass Player for the new board.", "Add a global transitions variable read by every session.", "Inject a validated Board behind the same landing-resolution contract."], correct: 3,
    explanations: ["Hard-coding board data couples topology to sequencing.", "Players do not own the board map.", "Global state prevents independent sessions and configurations.", "Board injection changes topology while GameSession keeps the same move and turn flow."],
    program: program("30 B", `board = {3: 30}\nplayers = ["A", "B"]\nposition = board.get(3, 3)\ncurrent = 1\nprint(position, players[current])`, `java.util.Map<Integer,Integer> board=java.util.Map.of(3,30); String[] players={"A","B"}; int position=board.getOrDefault(3,3),current=1; System.out.println(position+" "+players[current]);`, `map<int,int> board{{3,30}}; vector<string> players={"A","B"}; int position=board.count(3)?board[3]:3,current=1; cout<<position<<' '<<players[current]<<'\\n';`),
  },
  {
    slug: "bounded-rule", category: "change", tag: "Bounded rule strategy without global state", assumptions: "Two sessions inject independent exact-landing rules with targets 20 and 100.",
    prompt: "How should independent target sizes 20 and 100 be added without global session state?", choices: ["Inject a bounded movement rule carrying its target into each session.", "Change one process-wide TARGET before each roll.", "Let Player read the latest target from static state.", "Duplicate GameSession into two target-specific classes."], correct: 0,
    explanations: ["Per-session rule injection keeps the target explicit and independent, as both calls demonstrate.", "A process-wide value makes sessions interfere.", "Static target state has the same coupling and race risk.", "Duplicating orchestration is unnecessary when only one rule parameter varies."],
    program: program("19 99", `def move(position, roll, target):\n    return position if position + roll > target else position + roll\nprint(move(19, 2, 20), move(99, 2, 100))`, `java.util.function.IntBinaryOperator move=(position,target)->position+2>target?position:position+2; System.out.println(move.applyAsInt(19,20)+" "+move.applyAsInt(99,100));`, `auto move=[](int position,int target){return position+2>target?position:position+2;}; cout<<move(19,20)<<' '<<move(99,100)<<'\\n';`),
  },
];

function concepts(prefix: string, seeds: ConceptSeed[]): { concepts: ConceptQuestion[]; keys: ProblemPackage["keysByVariantId"] } {
  const keys: ProblemPackage["keysByVariantId"] = {};
  const built = seeds.map((seed, index): ConceptQuestion => {
    const conceptId = `${prefix}.${seed.category}-${String(index + 1).padStart(2, "0")}`;
    const variants = Object.fromEntries(LANGUAGES.map((language) => {
      const id = `${conceptId}.${language}`;
      const options = seed.choices.map((text, optionIndex) => ({ id: `${id}.${String.fromCharCode(97 + optionIndex)}`, text }));
      keys[id] = {
        correctOptionId: options[seed.correct]!.id,
        rationaleByOptionId: Object.fromEntries(options.map((option, optionIndex) => [option.id, seed.explanations[optionIndex]!])),
      };
      return [language, { id, language, snippet: seed.program[language], assumptions: seed.assumptions, prompt: seed.prompt, options }];
    })) as ConceptQuestion["variants"];
    return { id: conceptId, track: "problem_oop", category: seed.category, conceptTag: seed.tag, marks: 5, variants };
  });
  return { concepts: built, keys };
}

function rubric(problem: "Tic-Tac-Toe" | "Snake and Ladder"): RubricCriterion[] {
  const focus = problem === "Tic-Tac-Toe"
    ? ["3×3, X/O, legal moves, terminal outcomes", "board state and game sequencing", "board ownership and player coordination", "turn, rejection, win, and draw flows", "fixed scope and likely rule changes"]
    : ["zero start, exact 100, one transition, and turn rules", "board, die, players, and session", "validated board and injected collaborators", "roll, overshoot, transition, and completion flows", "board/rule variation without global state"];
  const ids = ["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"] as const;
  return ids.map((id, index) => ({
    id,
    description: `How clearly the design handles ${focus[index]}.`,
    anchors: {
      0: `Does not address ${focus[index]}.`,
      1: `Mentions ${focus[index]} but leaves major contradictions or gaps.`,
      2: `Partly handles ${focus[index]} with important behavior or ownership left implicit.`,
      3: `Handles ${focus[index]} coherently with only minor omissions.`,
      4: `Handles ${focus[index]} completely, consistently, and with explicit consequences.`,
    },
  }));
}

function buildPackage(kind: "ttt" | "snl"): ProblemPackage {
  const isTtt = kind === "ttt";
  const problemId = isTtt ? "tic-tac-toe" : "snake-and-ladder";
  const title = isTtt ? "Tic-Tac-Toe" : "Snake and Ladder";
  const { concepts: builtConcepts, keys } = concepts(kind, isTtt ? tttSeeds : snakeSeeds);
  const requirements = isTtt ? [
    { id: "ttt.req.board", text: "Use a 3×3 board with X and O; X moves first and accepted moves alternate players." },
    { id: "ttt.req.legal", text: "Reject out-of-bounds, occupied-cell, wrong-turn, and post-completion moves without changing state." },
    { id: "ttt.req.outcome", text: "Detect row, column, and diagonal wins, otherwise declare a draw only when the full board has no winner." },
  ] : [
    { id: "snl.req.board", text: "Validate unique transition starts in 1 through 99 and endpoints in 1 through 100; forbid self-transitions and start 100, with ladders moving upward and snakes moving downward." },
    { id: "snl.req.move", text: "Players start at zero, move only on die values 1 through 6, require exact 100, and remain unchanged on overshoot." },
    { id: "snl.req.turn", text: "Run one local session, advance after every accepted roll with no bonus for six, and apply at most one landing transition." },
    { id: "snl.req.complete", text: "Finish when a player reaches 100 and reject later rolls." },
  ];
  const common = {
    problemId, contentVersion: "1.0.0", title,
    introduction: isTtt ? "Design a local two-player Tic-Tac-Toe game with explicit rule ownership and atomic moves." : "Design one local Snake and Ladder session with deterministic rules and a validated board.",
    requirements,
    exclusions: isTtt ? ["Networking", "Computer players", "Undo and move history"] : ["Concurrent sessions", "Bonus turns for rolling six", "Chained snakes or ladders"],
    example: isTtt ? "X plays (0,0), O plays (1,0), and legal turns continue until a win or draw." : "A player at 97 who rolls 3 reaches 100; a player at 98 who rolls 3 stays at 98.",
    faq: isTtt ? [
      { question: "What board and marks are used?", answer: "Exactly a 3×3 board with X and O; X starts." },
      { question: "What happens after rejection or completion?", answer: "A rejected move changes nothing, and no move is accepted after a win or draw." },
    ] : [
      { question: "Where do players begin and how do they win?", answer: "Every player begins at zero and must land exactly on 100." },
      { question: "Do sixes or transitions chain?", answer: "A six gives no bonus turn, and a landing applies at most one snake or ladder." },
      { question: "How many sessions are in scope?", answer: "One local session; concurrent session management is excluded." },
    ],
    scenarioPrompts: isTtt
      ? { normal: "Walk through alternating legal moves that end in a diagonal win.", failure: "Walk through an occupied-cell attempt and show that board, turn, and outcome stay unchanged." }
      : { normal: "Walk through two players taking turns, including one transition and an exact landing on 100.", failure: "Walk through an invalid die value, an overshoot, and a roll attempted after completion." },
    attribution: { url: SOURCE, commit: COMMIT, adaptations: ["Reduced to one local session.", "Requirements and all executable questions were newly authored for this practice package."] },
  };
  const publicByLanguage = Object.fromEntries(LANGUAGES.map((language) => [language, {
    ...common,
    language,
    questions: builtConcepts.map((concept) => ({ conceptId: concept.id, conceptTag: concept.conceptTag, track: concept.track, variant: concept.variants[language] })),
  }])) as ProblemPackage["publicByLanguage"];
  return ProblemPackageSchema.parse({
    problemId, contentVersion: "1.0.0", publicByLanguage, concepts: builtConcepts, keysByVariantId: keys,
    rubricVersion: isTtt ? "ttt-rubric-v1" : "snl-rubric-v1",
    rubric: rubric(title),
    referenceDesign: isTtt
      ? "# One valid approach\n\nA Game coordinates two Players and owns a Board. Board owns its private 3×3 cells, validates bounds and occupancy, returns snapshots, and detects lines. Game validates the expected player and terminal state, asks Board to place, then checks win before draw and advances only after an accepted non-terminal move."
      : "# One valid approach\n\nA GameSession owns ordered Players and their positions, and depends on injected Board, Die, and MovementRule collaborators. Board validates unique starts in 1 through 99, bounded endpoints, direction, and non-self transitions at construction. GameSession validates session state and die result before mutation. An overshoot preserves the existing position and does not reapply a transition there; only a newly reached in-bounds landing gets one Board lookup. The session checks exact-100 completion and advances once after each accepted non-winning roll.",
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

const packages = [deepFreeze(buildPackage("ttt")), deepFreeze(buildPackage("snl"))];
const packageByKey = new Map(packages.map((pkg) => [`${pkg.problemId}@${pkg.contentVersion}`, pkg]));

export class ContentLookupError extends Error {
  constructor(message: string) { super(message); this.name = "ContentLookupError"; }
}

export function getProblemPackage(problemId: string, contentVersion: string): ProblemPackage | null {
  return packageByKey.get(`${problemId}@${contentVersion}`) ?? null;
}

export function listPublicProblems(): { problemId: string; contentVersion: string; title: string }[] {
  return packages.map(({ problemId, contentVersion, publicByLanguage }) => ({ problemId, contentVersion, title: publicByLanguage.java.title }));
}

export function projectPublicProblem(pkg: ProblemPackage, language: Language): PublicProblemSnapshot {
  return structuredClone(pkg.publicByLanguage[language]);
}

export function getPublicProblemSnapshot(problemId: string, contentVersion: string, language: Language): PublicProblemSnapshot | null {
  const pkg = getProblemPackage(problemId, contentVersion);
  return pkg ? projectPublicProblem(pkg, language) : null;
}

export class DefaultMcqEvaluator implements McqEvaluator {
  private readonly scores = new DefaultScorePolicy();

  evaluate(content: ProblemPackage, language: Language, answers: Record<string, string | null>): McqResult {
    const variants = content.concepts.map(({ variants }) => variants[language]);
    const allowed = new Map(variants.map((variant) => [variant.id, variant]));
    for (const [variantId, optionId] of Object.entries(answers)) {
      const variant = allowed.get(variantId);
      if (!variant) throw new ContentLookupError(`Unknown ${language} variant ID: ${variantId}`);
      if (optionId !== null && !variant.options.some(({ id }) => id === optionId)) {
        throw new ContentLookupError(`Unknown option ID for ${variantId}: ${optionId}`);
      }
    }
    const questions = variants.map((variant) => {
      const selectedOptionId = answers[variant.id] ?? null;
      const key = content.keysByVariantId[variant.id]!;
      const correct = selectedOptionId === key.correctOptionId;
      return { variantId: variant.id, track: "problem_oop" as const, selectedOptionId, correctOptionId: key.correctOptionId, awardedMarks: correct ? 5 as const : 0 as const, rationaleByOptionId: { ...key.rationaleByOptionId } };
    });
    const correctCount = questions.filter(({ awardedMarks }) => awardedMarks === 5).length;
    const score = this.scores.mcq(correctCount, questions.length);
    return { evaluatorVersion: "mcq-v1", correctCount, ...score, questions, referenceDesign: content.referenceDesign };
  }
}

export type AuthoringSnippet = { variantId: string; language: Language; source: string; expectedOutput: string };

export function listAuthoringSnippets(): AuthoringSnippet[] {
  return [
    ...tttSeeds.flatMap((seed, index) => LANGUAGES.map((language) => ({ variantId: `ttt.${seed.category}-${String(index + 1).padStart(2, "0")}.${language}`, language, source: seed.program[language], expectedOutput: seed.program.expectedOutput }))),
    ...snakeSeeds.flatMap((seed, index) => LANGUAGES.map((language) => ({ variantId: `snl.${seed.category}-${String(index + 1).padStart(2, "0")}.${language}`, language, source: seed.program[language], expectedOutput: seed.program.expectedOutput }))),
  ];
}
