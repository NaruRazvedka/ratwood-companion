/world
	name = "Isolated pinned Ratwood handler checks"
	visibility = 0
	hub = ""
	maxx = 1
	maxy = 1
	maxz = 1
var/global/list/checks = list()
var/global/passed = 0
/proc/check(id, actual, expected, tolerance = 0)
	var/ok = abs(actual-expected) <= tolerance
	checks += list(list("id"=id, "passed"=ok, "actual"=actual, "expected"=expected, "tolerance"=tolerance))
	if(ok)
		passed++
/proc/cauldron(water = 90, skill = 2, score = 5, with_user = TRUE)
	var/obj/machinery/light/rogue/cauldron/C = new(locate(1,1,1))
	C.reagents = new
	C.reagents.add_reagent(/datum/reagent/water, water)
	if(with_user)
		C.lastuser = new
		C.lastuser.fixture_skill = skill
	var/obj/item/alch/A = new(C)
	A.major_pot = /datum/alch_cauldron_recipe/antidote
	C.ingredients += A
	var/obj/item/alch/B = new(C)
	if(score == 5)
		B.med_pot = /datum/alch_cauldron_recipe/antidote
	else
		B.minor_pot = /datum/alch_cauldron_recipe/antidote
	C.ingredients += B
	return C
/proc/count_type(path)
	var/count = 0
	for(var/obj/O in locate(1,1,1))
		if(O.type == path)
			count++
	return count
/proc/clean_floor()
	for(var/obj/O in locate(1,1,1))
		del(O)
/world/New()
	..()
	world.OpenPort("none")
	run_checks()
	var/list/result = list("revision"="2d61e02c69520dacb0f4edc1d269395713cbeafb", "evidenceKind"="native-isolated-handler", "byondVersion"="[world.byond_version].[world.byond_build]", "passed"=passed, "total"=checks.len, "checks"=checks)
	text2file(json_encode(result), "results.json")
	del(world)
/proc/run_checks()
	for(var/bars in list(1, 4, 10))
		var/obj/machinery/light/rogue/smelter/F = new
		var/obj/item/I = new(F)
		I.smeltresult = /obj/item/fixture_ingot
		I.smelt_bar_num = bars
		F.contained_items[I] = 6
		F.handle_smelting()
		check("furnace-bars-[bars]-output-count", F.contained_items.len, 1)
		var/obj/item/output = F.contained_items[1]
		check("furnace-bars-[bars]-quality", output.fixture_quality, 6)
		check("furnace-bars-[bars]-input-deleted", isnull(I), TRUE)
		check("furnace-bars-[bars]-progress", F.smelting_progress, 21)
		del(F)
	var/datum/armor/A = getArmor(10,20,30,40,50,60,70,80)
	var/datum/armor/B = A.multiplymodifyAllRatings(0.5)
	var/datum/armor/D = A.attachArmor(B).detachArmor(B)
	var/list/channels = list("blunt", "slash", "stab", "piercing", "fire", "acid", "magic", "bullet")
	for(var/i = 1, i <= channels.len, i++)
		check("armor-half-[channels[i]]", B.getRating(channels[i]), i*5)
		check("armor-attach-detach-[channels[i]]", D.getRating(channels[i]), i*10)
	var/datum/armor/E = A.setRating(blunt=0, magic=99)
	check("armor-set-zero", E.blunt, 0)
	check("armor-set-preserves-omitted", E.slash, 20)
	check("armor-set-magic", E.magic, 99)
	var/mob/living/target = new
	target.fixture_armor_tier = 3
	check("armor-block-blunt-tier3-damage100", target.run_armor_check(attack_flag="blunt", damage=100), 100)
	check("armor-block-fire-tier3-damage100", target.run_armor_check(attack_flag="fire", damage=100), 37.5)
	check("armor-block-acid-tier3-damage100", target.run_armor_check(attack_flag="acid", damage=100), 37.5)
	check("armor-block-bullet-tier3-damage100", target.run_armor_check(attack_flag="bullet", damage=100), 37.5)
	check("armor-block-slash-pen2-tier3", target.run_armor_check(attack_flag="slash", damage=100, armor_penetration=2), 1000)
	check("armor-block-slash-pen3-tier3", target.run_armor_check(attack_flag="slash", damage=100, armor_penetration=3), 30, 0.0001)
	check("armor-block-slash-pen4-tier3", target.run_armor_check(attack_flag="slash", damage=100, armor_penetration=4), 20, 0.0001)
	check("armor-block-piercing-pen3-tier3", target.run_armor_check(attack_flag="piercing", damage=100, armor_penetration=3), 80)
	check("armor-block-piercing-pen4-tier3", target.run_armor_check(attack_flag="piercing", damage=100, armor_penetration=4), 80)
	check("armor-block-piercing-pen2-tier3", target.run_armor_check(attack_flag="piercing", damage=100, armor_penetration=2), 1000)
	check("armor-block-stab-pen3-tier3", target.run_armor_check(attack_flag="stab", damage=100, armor_penetration=3), 30, 0.0001)
	var/obj/item/chunked = new
	chunked.sharpness = 1
	chunked.blade_int = 20
	check("armor-chunked-blade-no-penetration", target.run_armor_check(attack_flag="slash", damage=100, armor_penetration=4, used_weapon=chunked), 1000)
	del(chunked)
	target.fixture_armor_tier = 0
	check("armor-unarmored-blunt", target.run_armor_check(attack_flag="blunt", damage=100), 0)
	del(target)
	for(var/water in list(90, 180))
		var/obj/machinery/light/rogue/cauldron/C = cauldron(water)
		for(var/i = 1, i <= 20, i++)
			C.process()
		check("cauldron-[water]-twenty-progress", C.brewing, 20)
		check("cauldron-[water]-not-yet-output", C.reagents.get_reagent_amount(/datum/reagent/medicine/antidote), 0)
		C.process()
		check("cauldron-[water]-fixed-output", C.reagents.get_reagent_amount(/datum/reagent/medicine/antidote), 100)
		check("cauldron-[water]-water-consumed", C.reagents.get_reagent_amount(/datum/reagent/water), 0)
		check("cauldron-[water]-ingredients-cleared", C.ingredients.len, 0)
		check("cauldron-[water]-finished", C.brewing, 21)
		del(C)
	var/obj/machinery/light/rogue/cauldron/C = cauldron(89)
	C.process()
	check("cauldron-below-water-no-progress", C.brewing, 0)
	del(C)
	C = cauldron(90, 2, 4)
	C.brewing = 20
	C.process()
	check("cauldron-score-four-rejected", C.brewing, 0)
	check("cauldron-score-four-retains-water", C.reagents.get_reagent_amount(/datum/reagent/water), 90)
	del(C)
	C = cauldron(90, 2, 5, FALSE)
	C.brewing = 20
	C.process()
	check("cauldron-missing-lastuser-reset", C.brewing, 0)
	check("cauldron-missing-lastuser-retains-ingredients", C.ingredients.len, 2)
	check("cauldron-missing-lastuser-no-output", C.reagents.get_reagent_amount(/datum/reagent/medicine/antidote), 0)
	del(C)
	C = cauldron(90, 1)
	C.brewing = 20
	C.process()
	check("cauldron-skill-below-yuck", C.reagents.get_reagent_amount(/datum/reagent/yuck), 90)
	check("cauldron-skill-below-no-antidote", C.reagents.get_reagent_amount(/datum/reagent/medicine/antidote), 0)
	del(C)
	C = cauldron(90)
	C.on = FALSE
	C.process()
	check("cauldron-unlit-no-progress", C.brewing, 0)
	del(C)
	// Actual dough attack handlers, with controlled completion/cancel and minimal surface/tool types.
	var/mob/living/U = new
	var/obj/item/kitchen/rollingpin/R = new
	var/obj/item/reagent_containers/food/snacks/rogue/dough/dough = new(locate(1,1,1))
	dough.attackby(R, U)
	check("dough-roll-without-table-no-output", count_type(/obj/item/reagent_containers/food/snacks/rogue/flatdough), 0)
	check("dough-roll-without-table-preserves-input", !isnull(dough), TRUE)
	new /obj/structure/table(locate(1,1,1))
	fixture_action_completes = FALSE
	dough.attackby(R, U)
	check("dough-roll-cancel-preserves-input", !isnull(dough), TRUE)
	check("dough-roll-cancel-no-output", count_type(/obj/item/reagent_containers/food/snacks/rogue/flatdough), 0)
	fixture_action_completes = TRUE
	dough.attackby(R, U)
	check("dough-roll-success-input-deleted", isnull(dough), TRUE)
	check("dough-roll-success-one-flatdough", count_type(/obj/item/reagent_containers/food/snacks/rogue/flatdough), 1)
	var/obj/item/reagent_containers/food/snacks/rogue/flatdough/flat = locate() in locate(1,1,1)
	var/obj/item/knife = new
	knife.fixture_sharp = TRUE
	fixture_action_completes = FALSE
	flat.attackby(knife, U)
	check("flatdough-cut-cancel-no-output", count_type(/obj/item/reagent_containers/food/snacks/rogue/foodbase/hardtack_raw), 0)
	fixture_action_completes = TRUE
	flat.attackby(knife, U)
	check("flatdough-cut-two-crackerdough", count_type(/obj/item/reagent_containers/food/snacks/rogue/foodbase/hardtack_raw), 2)
	check("flatdough-cut-input-deleted", isnull(flat), TRUE)
	check("dough-tools-retained", !isnull(R) && !isnull(knife), TRUE)
	clean_floor()
	del(U)
	del(R)
	del(knife)
