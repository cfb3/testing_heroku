MSG="$1"
if [ -z $1 ] 
then
	MSG="no comit message"
fi
echo $MSG
git add .
git commit -m '$MSG'
git push heroku master
